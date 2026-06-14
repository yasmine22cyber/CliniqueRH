const express = require("express");
const {
  consultePersonnel,
  createPersonnel,
  updatePersonnel,
  deletePersonnel,
  getMonProfil,
  updateMonProfil,
} = require("../controllers/utilisateurController");

const router = express.Router();

router.get("/", consultePersonnel);
router.post("/", createPersonnel);
router.put("/:matricule", updatePersonnel);
router.delete("/:matricule", deletePersonnel);

router.get("/profil/:matricule", getMonProfil);
router.put("/profil/:matricule", updateMonProfil);

module.exports = router;