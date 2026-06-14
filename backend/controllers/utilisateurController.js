const { sendCredentialsEmail } = require("../services/mail");
const { findGradeById, findGradeByLabel } = require("../models/gradeModel");
const pool = require("../config/db");
const {
  getAllPersonnel,
  getPersonnelProfileByMatricule,
  insertPersonnel,
  updatePersonnelData,
  deletePersonnelData,
} = require("../models/utilisateurModel");

const normalizeRole = (role) => {
  const r = (role || "Personnel").toString().trim();
  const lower = r.toLowerCase();
  if (["admin rh", "adminrh", "admin"].includes(lower)) return "Admin RH";
  return "Personnel";
};

const normalizePersonName = (value) => {
  const text = `${value ?? ""}`.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const consultePersonnel = async (_req, res) => {
  try {
    const rows = await getAllPersonnel();
    return res.json(rows);
  } catch (error) {
    console.error("consultePersonnel error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const createPersonnel = async (req, res) => {
  try {
    const {
      matricule,
      prenom,
      nom,
      email,
      password,
      role,
      categorie,
      grade,
      id_grade,
      service,
      cin,
      contract,
      type_contrat,
      date_embauche,
      phone,
      num_telephone,
      adresse,
    } = req.body || {};

    const m = (String(matricule ?? "").match(/\d/g) || []).join("").slice(0, 10);
    const p = normalizePersonName(prenom);
    const n = normalizePersonName(nom);
    const mail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const pwd = typeof password === "string" ? password : "";
    const cinVal = (String(cin ?? "").match(/\d/g) || []).join("").slice(0, 8);
    const actualPhone = phone ?? num_telephone;
    const phoneVal = ((String(actualPhone ?? "").match(/\d/g) || []).join("") + "00000000").slice(0, 8);
    const adresseVal = ((typeof adresse === "string" ? adresse : "").trim()) || "Adresse non fournie";
    const actualContract = contract ?? type_contrat;
    const contractVal = actualContract || "CDI (Contrat à Durée Indéterminée)";
    const gradeInput = `${grade ?? ""}`.trim();
    let gradeIdVal = Number.isFinite(Number(id_grade)) && Number(id_grade) > 0 ? Number(id_grade) : null;
    const actualRole = role ?? categorie;
    const roleVal = normalizeRole(actualRole);

    if (m.length !== 10) return res.status(400).json({ message: "Matricule invalide (10 chiffres)." });
    if (!p || !n) return res.status(400).json({ message: "Nom et prénom requis." });
    if (!mail || mail.indexOf("@") === -1 || mail.lastIndexOf(".") < mail.indexOf("@") + 2) {
      return res.status(400).json({ message: "Email invalide." });
    }
    if (!pwd || pwd.length < 6) return res.status(400).json({ message: "Mot de passe requis (min 6 caractères)." });
    if (cinVal.length !== 8) return res.status(400).json({ message: "CIN invalide (8 chiffres)." });
    if (phoneVal.length !== 8) return res.status(400).json({ message: "Téléphone invalide (8 chiffres)." });
    if (!date_embauche) return res.status(400).json({ message: "Date d'embauche requise." });

    if (!gradeIdVal && gradeInput) {
      const gradeFromLabel = await findGradeByLabel(gradeInput, pool);
      if (!gradeFromLabel) return res.status(400).json({ message: "Grade introuvable." });
      gradeIdVal = gradeFromLabel.id_grade;
    }

    if (gradeIdVal) {
      const gradeRow = await findGradeById(gradeIdVal, pool);
      if (!gradeRow) return res.status(400).json({ message: "Grade introuvable." });
    }

    await insertPersonnel(
      m,
      p,
      n,
      mail,
      pwd,
      cinVal,
      phoneVal,
      adresseVal,
      contractVal,
      gradeIdVal,
      roleVal,
      date_embauche,
      service,
      gradeInput
    );

    sendCredentialsEmail(mail, m, pwd).catch((err) => {
      console.error("sendCredentialsEmail error:", err.message || err);
    });

    return res.status(201).json({ message: "Personnel ajouté." });
  } catch (error) {
    console.error("createPersonnel error:", error);
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
        fields: error.fields,
        fieldMessages: error.fieldMessages
      });
    }
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const updatePersonnel = async (req, res) => {
  const matriculeParam = (req.params.matricule || "").trim();
  if (!/^\d{10}$/.test(matriculeParam)) {
    return res.status(400).json({ message: "Matricule param invalide (10 chiffres)." });
  }

  try {
    await updatePersonnelData(matriculeParam, req.body);
    return res.json({ message: "Personnel mis à jour." });
  } catch (error) {
    console.error("updatePersonnel error:", error);
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
        fields: error.fields,
        fieldMessages: error.fieldMessages
      });
    }
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const deletePersonnel = async (req, res) => {
  const matriculeParam = (req.params.matricule || "").replace(/\D/g, "");
  if (!/^\d{10}$/.test(matriculeParam)) {
    return res.status(400).json({ message: "Matricule param invalide (10 chiffres)." });
  }
  try {
    await deletePersonnelData(matriculeParam);
    return res.json({ message: "Personnel supprimé." });
  } catch (error) {
    console.error("deletePersonnel error:", error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const getMonProfil = async (req, res) => {
  const matriculeParam = (req.params.matricule || "").trim();
  try {
    const profil = await getPersonnelProfileByMatricule(matriculeParam);
    if (!profil) {
      return res.status(404).json({ message: "Profil introuvable." });
    }
    return res.json(profil);
  } catch (error) {
    console.error("getMonProfil error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const updateMonProfil = async (req, res) => {
  const matriculeParam = (req.params.matricule || "").trim();
  if (!/^\d{10}$/.test(matriculeParam)) {
    return res.status(400).json({ message: "Matricule invalide (10 chiffres)." });
  }
  try {
    await updatePersonnelData(matriculeParam, req.body);
    return res.json({ message: "Profil mis à jour avec succès." });
  } catch (error) {
    console.error("updateMonProfil error:", error);
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
        fields: error.fields,
        fieldMessages: error.fieldMessages
      });
    }
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

module.exports = { 
  consultePersonnel, 
  createPersonnel, 
  updatePersonnel, 
  deletePersonnel,
  getMonProfil,
  updateMonProfil
};