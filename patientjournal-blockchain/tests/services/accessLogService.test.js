const { sha256, canonicalStringify } = require("../../src/blockchain/crypto");


// Varje test får en egen databas i minnet och en egen kedja genom att
// modulerna laddas om.

let db;
let model;
let service;
let Blockchain;
let Block;
let mineBlock;

const doctor = { id: 1, role: "läkare" };
const nurse = { id: 2, role: "sjuksköterska" };
const patient = { id: 4, role: "patient", patientId: 1 };

beforeEach(() => {
    jest.resetModules();

    db = require("../../src/config/database");
    require("../../src/database/seed")();
    model = require("../../src/models/accessLogModel");
    service = require("../../src/services/accessLogService");
    Blockchain = require("../../src/blockchain/Blockchain");
    Block = require("../../src/blockchain/Block");
    ({ mineBlock } = require("../../src/blockchain/proofOfWork"));
});


const rowById = (id) => db.prepare("SELECT * FROM access_logs WHERE id = ?").get(id);


describe("recordAccess", () => {

    test("skriver raden i databasen med användarens id och roll", () => {
        const { entry } = service.recordAccess({ user: doctor, patientId: 2, action: "READ" });
        const row = rowById(entry.id);

        expect(row.patient_id).toBe(2);
        expect(row.user_id).toBe(1);
        expect(row.role).toBe("läkare");
        expect(row.action).toBe("READ");
        expect(row.note_id).toBeNull();
        expect(row.timestamp).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    });

    test("returnerar raden med namn, hashar och block", () => {
        const { entry, block } = service.recordAccess({ user: doctor, patientId: 1, action: "READ" });

        expect(entry.userName).toBe("Anna Andersson");
        expect(entry.entryHash).toMatch(/^[0-9a-f]{64}$/);
        expect(entry.blockHash).toBe(block.hash);
        expect(block).toBe(service.getBlockchain().getLatestBlock());
    });

    test("entry_hash är sha256 av exakt de sju fälten, kanoniskt serialiserade", () => {
        const { entry } = service.recordAccess({ user: nurse, patientId: 1, action: "WRITE", noteId: 3 });
        const row = rowById(entry.id);

        const expected = sha256(canonicalStringify({
            id: row.id,
            patientId: row.patient_id,
            userId: row.user_id,
            role: row.role,
            action: row.action,
            noteId: row.note_id,
            timestamp: row.timestamp
        }));

        expect(row.entry_hash).toBe(expected);
        expect(service.hashEntry(entry)).toBe(expected);
    });

    test("minar ett eget block per post och skriver tillbaka block_hash", () => {
        const first = service.recordAccess({ user: doctor, patientId: 1, action: "READ" });
        const second = service.recordAccess({ user: doctor, patientId: 1, action: "READ" });

        expect(service.getChain().length).toBe(3);
        expect(first.block.index).toBe(1);
        expect(second.block.index).toBe(2);
        expect(rowById(first.entry.id).block_hash).toBe(first.block.hash);
        expect(rowById(second.entry.id).block_hash).toBe(second.block.hash);
    });

    test("blocket innehåller bara de sju fälten och entryHash, ingen journaltext", () => {
        const { block, entry } = service.recordAccess({ user: nurse, patientId: 1, action: "WRITE", noteId: 2 });

        expect(Object.keys(block.data).sort()).toEqual(
            [...service.HASHED_FIELDS, "entryHash"].sort()
        );
        expect(block.data).toEqual({
            id: entry.id,
            patientId: 1,
            userId: 2,
            role: "sjuksköterska",
            action: "WRITE",
            noteId: 2,
            timestamp: entry.timestamp,
            entryHash: entry.entryHash
        });

        const serialized = JSON.stringify(service.getChain());
        expect(serialized).not.toContain("Anna");
        expect(serialized).not.toContain("Provtagning");
    });

    test("noteId är null när inget anges", () => {
        const { block } = service.recordAccess({ user: doctor, patientId: 1, action: "READ" });

        expect(block.data.noteId).toBeNull();
    });

    test("loggar nekad åtkomst mot den patient försöket gällde", () => {
        const { entry } = service.recordAccess({ user: patient, patientId: 2, action: "DENIED" });

        expect(entry.patientId).toBe(2);
        expect(entry.userId).toBe(4);
        expect(entry.role).toBe("patient");
        expect(entry.action).toBe("DENIED");
    });

    test("skickar händelsen block med origin local", () => {
        const listener = jest.fn();
        service.events.on("block", listener);

        const { entry, block } = service.recordAccess({ user: doctor, patientId: 1, action: "READ" });

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({ block, entry, origin: "local" });
    });

    test("avvisar en okänd åtgärd", () => {
        expect(() => service.recordAccess({ user: doctor, patientId: 1, action: "DELETE" })).toThrow();
        expect(service.getChain().length).toBe(1);
    });

    test("avvisar en patient som inte finns", () => {
        expect(() => service.recordAccess({ user: doctor, patientId: 999, action: "READ" })).toThrow();
        expect(service.getChain().length).toBe(1);
    });
});


describe("getLogForPatient", () => {

    test("ger bara patientens rader, senaste först, med namn på användaren", () => {
        service.recordAccess({ user: doctor, patientId: 1, action: "READ" });
        service.recordAccess({ user: nurse, patientId: 2, action: "READ" });
        service.recordAccess({ user: nurse, patientId: 1, action: "WRITE", noteId: 1 });

        const log = service.getLogForPatient(1);

        expect(log.map(entry => entry.action)).toEqual(["WRITE", "READ"]);
        expect(log.map(entry => entry.userName)).toEqual(["Erik Svensson", "Anna Andersson"]);
        expect(log.every(entry => entry.patientId === 1)).toBe(true);
    });

    test("ger tom lista för en patient utan åtkomster", () => {
        expect(service.getLogForPatient(3)).toEqual([]);
    });
});


describe("verifyEntry", () => {

    test("godkänner en orörd rad", () => {
        const { entry } = service.recordAccess({ user: doctor, patientId: 1, action: "READ" });

        expect(service.verifyEntry(entry)).toBe(true);
    });

    test.each([
        ["action", "UPDATE access_logs SET action = 'WRITE' WHERE id = ?"],
        ["user_id", "UPDATE access_logs SET user_id = 2 WHERE id = ?"],
        ["patient_id", "UPDATE access_logs SET patient_id = 2 WHERE id = ?"],
        ["role", "UPDATE access_logs SET role = 'vårdcentral' WHERE id = ?"],
        ["note_id", "UPDATE access_logs SET note_id = 1 WHERE id = ?"],
        ["timestamp", "UPDATE access_logs SET timestamp = '2020-01-01T00:00:00.000Z' WHERE id = ?"]
    ])("underkänner en rad där %s ändrats", (field, sql) => {
        const { entry } = service.recordAccess({ user: doctor, patientId: 1, action: "READ" });

        db.prepare(sql).run(entry.id);

        expect(service.verifyEntry(model.findById(entry.id))).toBe(false);
    });

    test("underkänner en rad vars sparade entry_hash ändrats", () => {
        const { entry } = service.recordAccess({ user: doctor, patientId: 1, action: "READ" });

        db.prepare("UPDATE access_logs SET entry_hash = ? WHERE id = ?").run("f".repeat(64), entry.id);

        expect(service.verifyEntry(model.findById(entry.id))).toBe(false);
    });

    test("underkänner en rad som lagts in direkt i databasen utan block", () => {
        db.prepare(`
            INSERT INTO access_logs (patient_id, user_id, role, action, timestamp, entry_hash)
            VALUES (1, 1, 'läkare', 'READ', '2026-10-01T12:00:00.000Z', ?)
        `).run(service.hashEntry({
            id: 1, patientId: 1, userId: 1, role: "läkare", action: "READ",
            noteId: null, timestamp: "2026-10-01T12:00:00.000Z"
        }));

        expect(service.verifyEntry(service.getLogForPatient(1)[0])).toBe(false);
    });
});


describe("verifyAll", () => {

    test("godkänner när databas och kedja stämmer", () => {
        service.recordAccess({ user: doctor, patientId: 1, action: "READ" });
        service.recordAccess({ user: patient, patientId: 2, action: "DENIED" });
        service.recordAccess({ user: nurse, patientId: 1, action: "WRITE", noteId: 1 });

        expect(service.verifyAll()).toEqual({
            valid: true,
            chainValid: true,
            rowCount: 3,
            entryCount: 3,
            tamperedRows: [],
            missingRows: []
        });
    });

    test("godkänner en tom liggare", () => {
        expect(service.verifyAll()).toMatchObject({ valid: true, rowCount: 0, entryCount: 0 });
    });

    test("pekar ut en ändrad rad", () => {
        service.recordAccess({ user: doctor, patientId: 1, action: "READ" });
        const { entry } = service.recordAccess({ user: patient, patientId: 2, action: "DENIED" });

        db.prepare("UPDATE access_logs SET action = 'READ' WHERE id = ?").run(entry.id);

        expect(service.verifyAll()).toMatchObject({
            valid: false,
            chainValid: true,
            tamperedRows: [entry.id],
            missingRows: []
        });
    });

    test("upptäcker en raderad rad trots att alla kvarvarande hashar stämmer", () => {
        service.recordAccess({ user: doctor, patientId: 1, action: "READ" });
        const { entry } = service.recordAccess({ user: patient, patientId: 2, action: "DENIED" });
        service.recordAccess({ user: nurse, patientId: 1, action: "READ" });

        db.prepare("DELETE FROM access_logs WHERE id = ?").run(entry.id);

        const report = service.verifyAll();

        expect(report.valid).toBe(false);
        expect(report.tamperedRows).toEqual([]);
        expect(report.missingRows).toEqual([entry.id]);
        expect(report.rowCount).toBe(2);
        expect(report.entryCount).toBe(3);
    });

    test("upptäcker att hela liggaren tömts", () => {
        service.recordAccess({ user: doctor, patientId: 1, action: "READ" });
        service.recordAccess({ user: doctor, patientId: 2, action: "READ" });

        db.prepare("DELETE FROM access_logs").run();

        expect(service.verifyAll()).toMatchObject({
            valid: false,
            rowCount: 0,
            entryCount: 2,
            missingRows: [1, 2]
        });
    });

    test("rapporterar en manipulerad kedja", () => {
        service.recordAccess({ user: doctor, patientId: 1, action: "READ" });
        service.recordAccess({ user: doctor, patientId: 1, action: "READ" });

        const chain = service.getChain();
        chain[1] = { ...chain[1], data: { ...chain[1].data, userId: 5 } };

        expect(service.verifyAll()).toMatchObject({ valid: false, chainValid: false });
    });
});


describe("receiveBlock", () => {

    function blockFromOtherNode(data) {
        const previous = service.getBlockchain().getLatestBlock();
        const block = mineBlock(new Block({
            index: previous.index + 1,
            timestamp: new Date().toISOString(),
            data,
            previousHash: previous.hash
        }), service.getBlockchain().difficulty);

        return JSON.parse(JSON.stringify(block));
    }

    test("lägger till ett giltigt block och skickar händelsen med origin remote", () => {
        service.recordAccess({ user: doctor, patientId: 1, action: "READ" });

        // Den andra noden har samma kedja och minar nästa block
        const otherNode = new Blockchain();
        otherNode.appendBlock(service.getChain()[1]);
        const incoming = JSON.parse(JSON.stringify(otherNode.addBlock({
            id: 99, patientId: 1, userId: 1, role: "läkare", action: "READ",
            noteId: null, timestamp: "2026-10-01T12:00:00.000Z", entryHash: "a".repeat(64)
        })));

        const listener = jest.fn();
        service.events.on("block", listener);

        expect(service.receiveBlock(incoming)).toBe(true);
        expect(service.getChain().length).toBe(3);
        expect(service.getBlockchain().getLatestBlock().hash).toBe(incoming.hash);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0][0]).toMatchObject({ origin: "remote", entry: null });
        expect(listener.mock.calls[0][0].block.hash).toBe(incoming.hash);
    });

    test("bifogar databasraden när den finns", () => {
        const { entry, block } = service.recordAccess({ user: doctor, patientId: 1, action: "READ" });

        // Starta om kedjan på "vår" sida och ta emot samma block utifrån
        jest.resetModules();
        const freshService = require("../../src/services/accessLogService");
        const listener = jest.fn();
        freshService.events.on("block", listener);

        // Ny modulinstans betyder ny databas i minnet, så raden måste finnas där
        const freshDb = require("../../src/config/database");
        require("../../src/database/seed")();
        freshDb.prepare(`
            INSERT INTO access_logs (id, patient_id, user_id, role, action, note_id, timestamp, entry_hash, block_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(entry.id, entry.patientId, entry.userId, entry.role, entry.action, entry.noteId, entry.timestamp, entry.entryHash, entry.blockHash);

        expect(freshService.receiveBlock(JSON.parse(JSON.stringify(block)))).toBe(true);
        expect(listener.mock.calls[0][0].entry).toMatchObject({ id: entry.id, userName: "Anna Andersson" });
    });

    test("avvisar ett ogiltigt block utan att skicka någon händelse", () => {
        const listener = jest.fn();
        service.events.on("block", listener);

        const bad = blockFromOtherNode({ id: 1, entryHash: "x" });
        bad.data.id = 2;

        expect(service.receiveBlock(bad)).toBe(false);
        expect(service.receiveBlock(null)).toBe(false);
        expect(service.getChain().length).toBe(1);
        expect(listener).not.toHaveBeenCalled();
    });

    test("avvisar ett block som redan finns", () => {
        const { block } = service.recordAccess({ user: doctor, patientId: 1, action: "READ" });

        expect(service.receiveBlock(JSON.parse(JSON.stringify(block)))).toBe(false);
        expect(service.getChain().length).toBe(2);
    });
});


describe("replaceChain", () => {

    const foreignEntry = (id) => ({
        id, patientId: 2, userId: 2, role: "sjuksköterska", action: "READ",
        noteId: null, timestamp: "2026-10-01T12:00:00.000Z", entryHash: String(id).repeat(64).slice(0, 64)
    });

    // En annan nods kedja med ett antal egna poster
    function foreignChain(count) {
        const other = new Blockchain();
        for (let i = 0; i < count; i++) {
            other.addBlock(foreignEntry(50 + i));
        }
        return JSON.parse(JSON.stringify(other.chain));
    }

    test("byter till en längre giltig kedja", () => {
        expect(service.replaceChain(foreignChain(2))).toBe(true);
        expect(service.getChain()).toHaveLength(3);
        expect(service.getChain()[2].data.id).toBe(51);
    });

    test("behåller egen kedja om den mottagna är lika lång, kortare eller ogiltig", () => {
        service.recordAccess({ user: doctor, patientId: 1, action: "READ" });
        const before = service.getBlockchain().getLatestBlock().hash;

        expect(service.replaceChain(foreignChain(1))).toBe(false);
        expect(service.replaceChain(foreignChain(0))).toBe(false);

        const tampered = foreignChain(3);
        tampered[2].data.userId = 1;
        expect(service.replaceChain(tampered)).toBe(false);

        expect(service.replaceChain(null)).toBe(false);
        expect(service.getBlockchain().getLatestBlock().hash).toBe(before);
    });

    test("minar om egna poster som försvann i bytet och uppdaterar radens block_hash", () => {
        const { entry, block } = service.recordAccess({ user: doctor, patientId: 1, action: "READ" });
        const listener = jest.fn();
        service.events.on("block", listener);

        expect(service.replaceChain(foreignChain(2))).toBe(true);

        const chain = service.getChain();
        expect(chain).toHaveLength(4);
        expect(chain[1].data.id).toBe(50);
        expect(chain[2].data.id).toBe(51);

        // Vår post ligger sist i ett nytt block med samma data
        const remined = chain[3];
        expect(remined.data).toEqual(block.data);
        expect(remined.hash).not.toBe(block.hash);
        expect(remined.previousHash).toBe(chain[2].hash);
        expect(service.getBlockchain().isChainValid()).toBe(true);

        // Raden pekar på det nya blocket och verifieras fortfarande
        const row = model.findById(entry.id);
        expect(row.blockHash).toBe(remined.hash);
        expect(row.entryHash).toBe(entry.entryHash);
        expect(service.verifyEntry(row)).toBe(true);

        // Händelsen skickas som ett eget block så att P2P sprider det
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0][0]).toMatchObject({ origin: "local", entry: { id: entry.id } });
        expect(listener.mock.calls[0][0].block.hash).toBe(remined.hash);
    });

    test("minar om flera poster i ursprunglig ordning", () => {
        const first = service.recordAccess({ user: doctor, patientId: 1, action: "READ" });
        const second = service.recordAccess({ user: doctor, patientId: 2, action: "READ" });

        expect(service.replaceChain(foreignChain(3))).toBe(true);

        const chain = service.getChain();
        expect(chain).toHaveLength(6);
        expect(chain[4].data.entryHash).toBe(first.entry.entryHash);
        expect(chain[5].data.entryHash).toBe(second.entry.entryHash);
        expect(service.verifyAll()).toMatchObject({ tamperedRows: [], rowCount: 2 });
    });

    test("minar inte om poster som redan finns i den nya kedjan", () => {
        const { block } = service.recordAccess({ user: doctor, patientId: 1, action: "READ" });

        const other = new Blockchain();
        other.appendBlock(JSON.parse(JSON.stringify(block)));
        other.addBlock(foreignEntry(50));

        expect(service.replaceChain(JSON.parse(JSON.stringify(other.chain)))).toBe(true);
        expect(service.getChain()).toHaveLength(3);
        expect(service.getChain()[1].hash).toBe(block.hash);
    });
});
