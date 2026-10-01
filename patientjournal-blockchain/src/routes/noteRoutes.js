const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { createNote } = require("../controllers/noteController");


// Monteras under /api/patients
const router = express.Router();

// Rollen kontrolleras i controllern så att nekade försök kan loggas
router.post("/:id/notes", authMiddleware, createNote);


module.exports = router;
