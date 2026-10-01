-- Databasschema för patientjournalen.
-- Körs vid varje start via src/config/database.js, därför IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS patients (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_number TEXT    NOT NULL UNIQUE,
    first_name      TEXT    NOT NULL,
    last_name       TEXT    NOT NULL,
    date_of_birth   TEXT    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);


-- Lösenord lagras som scrypt-hash med ett eget salt per användare.
-- patient_id kopplar ett patientkonto till den journal kontot får läsa.
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    password_salt TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    role          TEXT    NOT NULL
                  CHECK (role IN ('läkare', 'sjuksköterska', 'vårdcentral', 'patient', 'obehörig')),
    patient_id    INTEGER UNIQUE REFERENCES patients(id),
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    -- Ett patientkonto måste alltid höra till en journal
    CHECK (role <> 'patient' OR patient_id IS NOT NULL)
);


-- Journalanteckningar. Själva texten finns bara här, aldrig i blockkedjan.
--   private: bara författaren
--   staff:   läkare och sjuksköterskor
--   all:     alla som får se journalen, inklusive patienten
CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    author_id  INTEGER NOT NULL REFERENCES users(id),
    title      TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    visibility TEXT    NOT NULL DEFAULT 'staff'
               CHECK (visibility IN ('private', 'staff', 'all')),
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);


-- Åtkomstliggaren. Varje rad får ett eget block i kedjan.
-- entry_hash är sha256 av id, patient_id, user_id, role, action, note_id
-- och timestamp. block_hash pekar på blocket som innehåller posten.
-- Båda fylls i efter att raden skapats, därför tillåts NULL.
CREATE TABLE IF NOT EXISTS access_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    user_id    INTEGER NOT NULL REFERENCES users(id),
    role       TEXT    NOT NULL
               CHECK (role IN ('läkare', 'sjuksköterska', 'vårdcentral', 'patient', 'obehörig')),
    action     TEXT    NOT NULL
               CHECK (action IN ('READ', 'WRITE', 'DENIED')),
    note_id    INTEGER REFERENCES notes(id),
    timestamp  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    entry_hash TEXT,
    block_hash TEXT
);


CREATE INDEX IF NOT EXISTS idx_notes_patient       ON notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_patient ON access_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_hash    ON access_logs(entry_hash);
