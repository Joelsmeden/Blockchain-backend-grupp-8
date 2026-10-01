const patientService = require("../services/patientService");
const noteService = require("../services/noteService");
const accessLogService = require("../services/accessLogService");
const { canWriteNotes } = require("../services/accessControl");


// POST /api/patients/:id/notes
//
// Bara personal får skriva. Andra roller får 403 och försöket loggas
// som DENIED mot patienten. En lyckad skrivning loggas som WRITE med
// anteckningens id.
function createNote(req, res) {

    const patient = patientService.findPatient(req.params.id);

    if (!patient) {
        return res.status(404).json({
            success: false,
            message: "Patienten finns inte."
        });
    }

    if (!canWriteNotes(req.user)) {

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

    const error = noteService.validateNote(req.body);

    if (error) {
        return res.status(400).json({
            success: false,
            message: error
        });
    }

    const note = noteService.createNote(req.user, patient.id, req.body);

    accessLogService.recordAccess({
        user: req.user,
        patientId: patient.id,
        action: accessLogService.ACTIONS.WRITE,
        noteId: note.id
    });

    res.status(201).json({
        success: true,
        message: "Anteckningen sparades.",
        note
    });
}


module.exports = {
    createNote
};
