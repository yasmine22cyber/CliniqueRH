const express = require("express");
const { listGrades, listGradeRestrictions } = require("../controllers/gradeController");

const router = express.Router();

router.get("/", listGrades);
router.get("/restrictions", listGradeRestrictions);

module.exports = router;
