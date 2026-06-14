const { fetchGrades, getGradeRestrictionKeys } = require("../models/gradeModel");
const pool = require("../config/db");

const listGrades = async (req, res) => {
  try {
    const { categorie } = req.query || {};
    const grades = await fetchGrades(categorie || null);
    return res.json(grades);
  } catch (error) {
    console.error("listGrades error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const listGradeRestrictions = async (_req, res) => {
  try {
    const payload = await getGradeRestrictionKeys(pool);
    return res.json(payload);
  } catch (error) {
    console.error("listGradeRestrictions error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

module.exports = { listGrades, listGradeRestrictions };