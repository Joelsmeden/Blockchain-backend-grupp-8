const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");


// Testerna kör mot en databas i minnet så att de inte påverkar varandra
// eller den riktiga filen. Annars delar båda noderna samma fil, som kan
// flyttas med DB_PATH.
const DEFAULT_DB_PATH = path.join(__dirname, "..", "..", "data", "patientjournal.db");

const dbPath = process.env.NODE_ENV === "test"
    ? ":memory:"
    : (process.env.DB_PATH || DEFAULT_DB_PATH);

if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}


const db = new Database(dbPath);

// WAL låter två processer läsa och skriva samma fil samtidigt.
// busy_timeout gör att en nod väntar i stället för att få fel när den
// andra noden håller skrivlåset.
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = ON");


// Skapa tabellerna om de saknas
const schemaPath = path.join(__dirname, "..", "database", "schema.sql");
db.exec(fs.readFileSync(schemaPath, "utf8"));


module.exports = db;
