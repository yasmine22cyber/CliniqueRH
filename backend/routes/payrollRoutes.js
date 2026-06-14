const express = require("express");
const {
  getFichePaie,
} = require("../controllers/payrollController");

const router = express.Router();

router.get("/fiche", getFichePaie);

module.exports = router;