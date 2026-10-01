const patientModel = require("../models/patientModel");


// Tolkar ett id från URL:en. Allt som inte är ett positivt heltal
// behandlas som att patienten inte finns.
function parseId(raw) {

    const id = Number(raw);

    return Number.isInteger(id) && id > 0 ? id : null;
}


function findPatient(rawId) {

    const id = parseId(rawId);

    return id === null ? null : patientModel.findById(id);
}


function searchPatients(query) {
    return patientModel.search(query);
}


module.exports = {
    parseId,
    findPatient,
    searchPatients
};
