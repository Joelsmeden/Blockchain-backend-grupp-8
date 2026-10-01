const db = require("../config/database");


// Kolumnerna döps om till camelCase redan i SQL så att raderna kan
// användas direkt i servicen och skickas vidare till frontend.

const COLUMNS = `
    a.id,
    a.patient_id  AS patientId,
    a.user_id     AS userId,
    u.name        AS userName,
    a.role,
    a.action,
    a.note_id     AS noteId,
    a.timestamp,
    a.entry_hash  AS entryHash,
    a.block_hash  AS blockHash
`;


const insertStmt = db.prepare(`
    INSERT INTO access_logs (patient_id, user_id, role, action, note_id, timestamp)
    VALUES (@patientId, @userId, @role, @action, @noteId, @timestamp)
    RETURNING
        id,
        patient_id AS patientId,
        user_id    AS userId,
        role,
        action,
        note_id    AS noteId,
        timestamp
`);

const setHashesStmt = db.prepare(`
    UPDATE access_logs
    SET entry_hash = @entryHash, block_hash = @blockHash
    WHERE id = @id
`);

const findByIdStmt = db.prepare(`
    SELECT ${COLUMNS}
    FROM access_logs a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE a.id = ?
`);

const findByPatientStmt = db.prepare(`
    SELECT ${COLUMNS}
    FROM access_logs a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE a.patient_id = ?
    ORDER BY a.id DESC
`);

const findAllStmt = db.prepare(`
    SELECT ${COLUMNS}
    FROM access_logs a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.id
`);

const countStmt = db.prepare("SELECT COUNT(*) AS count FROM access_logs");


function insert({ patientId, userId, role, action, noteId, timestamp }) {
    return insertStmt.get({ patientId, userId, role, action, noteId, timestamp });
}


function setHashes(id, entryHash, blockHash) {
    setHashesStmt.run({ id, entryHash, blockHash });
}


function findById(id) {
    return findByIdStmt.get(id) || null;
}


// Senaste först
function findByPatient(patientId) {
    return findByPatientStmt.all(patientId);
}


function findAll() {
    return findAllStmt.all();
}


function count() {
    return countStmt.get().count;
}


module.exports = {
    insert,
    setHashes,
    findById,
    findByPatient,
    findAll,
    count
};
