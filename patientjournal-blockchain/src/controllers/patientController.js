const patientService = require("../services/patientService");
const noteService = require("../services/noteService");
const accessLogService = require("../services/accessLogService");
const { canViewPatient } = require("../services/accessControl");


// GET /api/patients?q=
function searchPatients(req, res) {

    const patients = patientService.searchPatients(req.query.q);

    res.json({
        success: true,
        patients
    });
}


// GET /api/patients/:id
//
// Varje öppning av journalen loggas som READ. Ett nekat försök loggas
// som DENIED mot den patient försöket gällde och ger 403. Finns inte
// patienten blir det 404 utan loggning.
function getPatient(req, res) {

    const patient = patientService.findPatient(req.params.id);

    if (!patient) {
        return res.status(404).json({
            success: false,
            message: "Patienten finns inte."
        });
    }

    if (!canViewPatient(req.user, patient.id)) {

        accessLogService.recordAccess({
            user: req.user,
            patientId: patient.id,
            action: accessLogService.ACTIONS.DENIED
        });

        return res.status(403).json({
            success: false,
            message: "Åtkomst nekad."
        });
    }

    // Loggas före hämtningen så att den egna läsningen syns överst
    accessLogService.recordAccess({
        user: req.user,
        patientId: patient.id,
        action: accessLogService.ACTIONS.READ
    });

    res.json({
        success: true,
        patient,
        notes: noteService.getNotesForUser(req.user, patient.id),
        accessLog: accessLogService.getLogForPatient(patient.id)
    });
}


module.exports = {
    searchPatients,
    getPatient
};
