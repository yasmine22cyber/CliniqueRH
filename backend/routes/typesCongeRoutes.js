const express = require("express");
const { listTypes } = require("../controllers/typesCongeController");

const router = express.Router();

router.get("/", listTypes);

module.exports = router;

