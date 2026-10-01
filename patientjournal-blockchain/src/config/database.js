const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");


// Testerna kör mot en databas i minnet så att de inte påverkar varandra
// eller den riktiga filen, om inte DB_PATH anges uttryckligen. Annars
// delar båda noderna samma fil, som kan flyttas med DB_PATH.
const DEFAULT_DB_PATH = path.join(__dirname, "..", "..", "data", "patientjournal.db");

const dbPath = process.env.DB_PATH
    || (process.env.NODE_ENV === "test" ? ":memory:" : DEFAULT_DB_PATH);

if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}


const db = new Database(dbPath);

// busy_timeout gör att en nod väntar i stället för att få fel när den
// andra noden håller låset.
db.pragma("busy_timeout = 5000");

// WAL låter två processer läsa och skriva samma fil samtidigt. Själva
// bytet till WAL kräver ett exklusivt lås, och startas två noder
// samtidigt mot en ny databasfil försöker båda byta på en gång. Då ger
// SQLite SQLITE_BUSY direkt utan att vänta, för att undvika dödläge, så
// vi försöker igen en kort stund. Läget sparas i filen, vid senare
// starter behövs inget byte.
const deadline = Date.now() + 5000;

for (;;) {
    try {
        db.pragma("journal_mode = WAL");
        break;
    } catch (error) {
        if (error.code !== "SQLITE_BUSY" || Date.now() > deadline) {
            throw error;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
}

db.pragma("foreign_keys = ON");


// Skapa tabellerna om de saknas
const schemaPath = path.join(__dirname, "..", "database", "schema.sql");
db.exec(fs.readFileSync(schemaPath, "utf8"));


module.exports = db;
