const pool = require("../config/db");
const { listTypesConge } = require("../models/typesCongeModel");

const listTypes = async (_req, res) => {
  try {
    const rows = await listTypesConge(pool);
    return res.json(rows);
  } catch (error) {
    console.error("listTypesConge error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

module.exports = {
  listTypes,
};