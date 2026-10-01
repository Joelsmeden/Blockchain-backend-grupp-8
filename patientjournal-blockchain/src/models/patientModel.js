const db = require("../config/database");


const COLUMNS = `
    id,
    personal_number AS personalNumber,
    first_name      AS firstName,
    last_name       AS lastName,
    date_of_birth   AS dateOfBirth
`;


const findByIdStmt = db.prepare(`
    SELECT ${COLUMNS}
    FROM patients
    WHERE id = ?
`);

const findAllStmt = db.prepare(`
    SELECT ${COLUMNS}
    FROM patients
    ORDER BY last_name, first_name
`);

const searchStmt = db.prepare(`
    SELECT ${COLUMNS}
    FROM patients
    WHERE first_name LIKE @term
       OR last_name LIKE @term
       OR first_name || ' ' || last_name LIKE @term
       OR personal_number LIKE @term
    ORDER BY last_name, first_name
`);


function findById(id) {
    return findByIdStmt.get(id) || null;
}


// Söker på namn eller personnummer. Tom söksträng ger alla patienter.
function search(query) {

    const term = String(query || "").trim();

    if (!term) {
        return findAllStmt.all();
    }

    return searchStmt.all({ term: `%${term}%` });
}


module.exports = {
    findById,
    search
};
