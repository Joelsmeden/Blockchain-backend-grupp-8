const EventEmitter = require("events");
const Blockchain = require("../blockchain/Blockchain");
const { sha256, canonicalStringify } = require("../blockchain/crypto");
const accessLogModel = require("../models/accessLogModel");
const chainStore = require("../blockchain/chainStore");
const db = require("../config/database");


// Åtkomstliggaren finns på två ställen med olika syften.
//
// Raden i databasen är den som visas för användarna, med namn och
// tidpunkt. Blocket i kedjan innehåller samma post men bara med
// id-nummer, plus en hash av raden. Ändras eller raderas en rad i
// databasen stämmer den inte längre mot kedjan.
//
// Journaltext finns aldrig i kedjan, bara fälten nedan.

const ACTIONS = Object.freeze({
    READ: "READ",
    WRITE: "WRITE",
    DENIED: "DENIED"
});

const HASHED_FIELDS = Object.freeze([
    "id", "patientId", "userId", "role", "action", "noteId", "timestamp"
]);


const blockchain = new Blockchain();

// Skickar "block" när ett block lagts till, lokalt eller utifrån, med
// { block, entry, origin }. P2P och socket.io lyssnar här, så att den
// här modulen inte behöver känna till nätverket.
const events = new EventEmitter();


// Plockar ut exakt de sju fälten, med null i stället för undefined så
// att hashen blir densamma före och efter att posten gått via JSON.
function pickHashedFields(entry) {

    const fields = {};

    HASHED_FIELDS.forEach(field => {
        fields[field] = entry[field] === undefined ? null : entry[field];
    });

    return fields;
}


function hashEntry(entry) {
    return sha256(canonicalStringify(pickHashedFields(entry)));
}


// Raden i databasen som hör till ett block, om den finns
function entryForBlock(block) {

    const id = block && block.data && block.data.id;

    return Number.isInteger(id) ? accessLogModel.findById(id) : null;
}


// Raden, blocket och hasharna skrivs i en transaktion. Raden blir synlig
// för andra anslutningar, även den andra noden, först när transaktionen
// är klar, så den kan aldrig läsas utan entry_hash och block_hash.
// Blocket minas inuti transaktionen men läggs till i kedjan först när
// raden är sparad, så att kedjan inte får ett block vars rad rullats
// tillbaka.
const writeEntry = db.transaction(({ user, patientId, action, noteId }) => {

    const row = accessLogModel.insert({
        patientId: Number(patientId),
        userId: user.id,
        role: user.role,
        action,
        noteId,
        timestamp: new Date().toISOString()
    });

    const fields = pickHashedFields(row);
    const entryHash = hashEntry(fields);
    const block = blockchain.mineNextBlock({ ...fields, entryHash });

    accessLogModel.setHashes(row.id, entryHash, block.hash);

    return { row, block };
});


// Registrerar en åtkomst: skriver raden, hashar den, minar ett eget
// block för posten och skriver tillbaka hasharna på raden, allt i en
// transaktion. Sedan läggs blocket till i kedjan och sprids.
function recordAccess({ user, patientId, action, noteId = null }) {

    // immediate tar skrivlåset direkt, så två noder som loggar samtidigt
    // väntar på varandra i stället för att få SQLITE_BUSY mitt i
    const { row, block } = writeEntry.immediate({ user, patientId, action, noteId });

    if (!blockchain.appendBlock(block)) {
        throw new Error("Det minade blocket passar inte längst bak i kedjan.");
    }

    const stored = blockchain.getLatestBlock();

    persist();

    const entry = accessLogModel.findById(row.id);

    events.emit("block", { block: stored, entry, origin: "local" });

    return { entry, block: stored };
}


function getLogForPatient(patientId) {
    return accessLogModel.findByPatient(Number(patientId));
}


function hashesInChain() {
    return new Set(blockchain.chain.slice(1).map(block => block.data.entryHash));
}


// Räknar om hashen från databasraden och slår upp den i kedjan.
// Finns den inte har raden ändrats.
function verifyEntry(entry, chainHashes = hashesInChain()) {

    const recomputed = hashEntry(entry);

    return entry.entryHash === recomputed && chainHashes.has(recomputed);
}


// Kontrollerar alla rader mot kedjan. Hasharna avslöjar ändrade rader,
// men inte raderade: tas en rad bort helt stämmer fortfarande hasharna
// för de rader som finns kvar. Därför jämförs också posterna i kedjan
// mot raderna i databasen, och antalet.
function verifyAll() {

    const rows = accessLogModel.findAll();
    const entries = blockchain.chain.slice(1).map(block => block.data);

    const chainHashes = new Set(entries.map(entry => entry.entryHash));
    const rowIds = new Set(rows.map(row => row.id));

    const tamperedRows = rows
        .filter(row => !verifyEntry(row, chainHashes))
        .map(row => row.id);

    const missingRows = entries
        .filter(entry => !rowIds.has(entry.id))
        .map(entry => entry.id);

    const chainValid = blockchain.isChainValid();

    return {
        valid: chainValid
            && tamperedRows.length === 0
            && missingRows.length === 0
            && rows.length === entries.length,
        chainValid,
        rowCount: rows.length,
        entryCount: entries.length,
        tamperedRows,
        missingRows
    };
}


// Block från en annan nod. Returnerar true om det lades till.
function receiveBlock(block) {

    if (!blockchain.appendBlock(block)) {
        return false;
    }

    persist();

    const stored = blockchain.getLatestBlock();

    events.emit("block", { block: stored, entry: entryForBlock(stored), origin: "remote" });

    return true;
}


// Byter till en giltig kedja från en annan nod om den är längre, eller
// lika lång med lägre sista hash. Varje åtkomst blir ett block direkt,
// så två noder kan hinna skapa block med samma index. En kedja vinner,
// men då försvinner posterna i kedjan som förlorade. De jämförs före
// och efter bytet och minas om ovanpå den nya kedjan, så att ingen
// åtkomst tappas. Returnerar true om kedjan byttes.
function replaceChain(newChain) {

    const before = blockchain.chain.slice(1).map(block => block.data);

    if (!blockchain.replaceChain(newChain)) {
        return false;
    }

    persist();

    const kept = hashesInChain();
    const missing = before.filter(entry => !kept.has(entry.entryHash));

    missing.forEach(entry => {

        const block = blockchain.addBlock(entry);

        // Raden pekar på det gamla blocket, uppdatera till det nya
        accessLogModel.setHashes(entry.id, entry.entryHash, block.hash);
        persist();

        events.emit("block", { block, entry: entryForBlock(block), origin: "local" });
    });

    return true;
}


// Sparar nodens kedja till fil efter varje ändring. Gör inget i test.
function persist() {
    chainStore.save(blockchain.chain);
}


// Läser in nodens sparade kedja vid start. Byter bara om den är längre
// än den vi har och giltig. Returnerar true om kedjan lästes in.
function loadChain() {

    const saved = chainStore.load();

    return saved !== null && blockchain.replaceChain(saved);
}


function getChain() {
    return blockchain.chain;
}


function getBlockchain() {
    return blockchain;
}


module.exports = {
    ACTIONS,
    HASHED_FIELDS,
    events,
    hashEntry,
    recordAccess,
    getLogForPatient,
    verifyEntry,
    verifyAll,
    receiveBlock,
    replaceChain,
    loadChain,
    getChain,
    getBlockchain
};
