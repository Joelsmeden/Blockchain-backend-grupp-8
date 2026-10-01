const db = require("../config/database");


const COLUMNS = `
    n.id,
    n.patient_id AS patientId,
    n.author_id  AS authorId,
    u.name       AS authorName,
    u.role       AS authorRole,
    n.title,
    n.content,
    n.visibility,
    n.created_at AS createdAt
`;


const insertStmt = db.prepare(`
    INSERT INTO notes (patient_id, author_id, title, content, visibility)
    VALUES (@patientId, @authorId, @title, @content, @visibility)
    RETURNING id
`);

const findByIdStmt = db.prepare(`
    SELECT ${COLUMNS}
    FROM notes n
    JOIN users u ON u.id = n.author_id
    WHERE n.id = ?
`);


// IN-listan har olika längd beroende på roll, så frågan förbereds en
// gång per längd och återanvänds.
const findForReaderStmts = new Map();

function findForReaderStmt(count) {

    if (!findForReaderStmts.has(count)) {

        const placeholders = count > 0
            ? Array.from({ length: count }, () => "?").join(", ")
            : "NULL";

        findForReaderStmts.set(count, db.prepare(`
            SELECT ${COLUMNS}
            FROM notes n
            JOIN users u ON u.id = n.author_id
            WHERE n.patient_id = ?
              AND (n.visibility IN (${placeholders}) OR n.author_id = ?)
            ORDER BY n.created_at DESC, n.id DESC
        `));
    }

    return findForReaderStmts.get(count);
}


function findById(id) {
    return findByIdStmt.get(id) || null;
}


// Anteckningar läsaren får se: de med tillåten synlighet, plus alltid
// de läsaren själv har skrivit.
function findForReader(patientId, visibilities, readerId) {
    return findForReaderStmt(visibilities.length).all(patientId, ...visibilities, readerId);
}


function create({ patientId, authorId, title, content, visibility }) {

    const { id } = insertStmt.get({ patientId, authorId, title, content, visibility });

    return findById(id);
}


module.exports = {
    findById,
    findForReader,
    create
};
