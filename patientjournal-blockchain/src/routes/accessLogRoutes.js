const express = require("express");
const { getChain, verifyChain, getStatus } = require("../controllers/accessLogController");


// Monteras under /api. Kedjan innehåller bara id-nummer och hashar,
// ingen journaltext och inga namn, så den kan läsas utan inloggning.
const router = express.Router();

router.get("/chain", getChain);
router.get("/chain/verify", verifyChain);
router.get("/status", getStatus);


module.exports = router;
