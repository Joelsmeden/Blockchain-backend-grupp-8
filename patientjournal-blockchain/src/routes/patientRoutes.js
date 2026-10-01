const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const { SEARCH_ROLES } = require("../services/accessControl");
const { searchPatients, getPatient } = require("../controllers/patientController");


// Monteras under /api/patients
const router = express.Router();

// Sökning kräver en av SEARCH_ROLES. Journalen kräver bara inloggning
// här; vem som får se vilken patient avgörs i controllern, så att ett
// nekat försök kan loggas mot rätt patient.
router.get("/", authMiddleware, roleMiddleware(...SEARCH_ROLES), searchPatients);
router.get("/:id", authMiddleware, getPatient);


module.exports = router;
