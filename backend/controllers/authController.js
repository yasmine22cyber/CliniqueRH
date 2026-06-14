const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const { findByMatricule, checkEmailExists, updatePassword } = require("../models/utilisateurModel");
const { verifyPassword } = require("../utils/password");
const { sendResetEmail } = require("../services/mail");
const { upsertReset, findByEmail, deleteByEmail } = require("../models/passwordResetModel");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const RESET_EXP_MINUTES = 15;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
const LOCAL_HOST_REGEX = /^(localhost|127\.0\.0\.1)(:\d+)?$/i;

const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

const getResetBaseUrl = (req) => {
  const publicUrl = normalizeBaseUrl(process.env.APP_PUBLIC_URL);
  if (publicUrl) {
    return publicUrl;
  }

  const appUrl = normalizeBaseUrl(process.env.APP_URL);
  if (appUrl) {
    return appUrl;
  }

  const origin = normalizeBaseUrl(req.get("origin"));
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (!LOCAL_HOST_REGEX.test(parsed.host)) {
        return origin;
      }
    } catch (_error) {
     
    }
  }

  const host = String(req.get("x-forwarded-host") || req.get("host") || "").trim();
  if (host && !LOCAL_HOST_REGEX.test(host)) {
    const proto = String(req.get("x-forwarded-proto") || req.protocol || "http").trim();
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  return "http://localhost:5173";
};
//////////////////////////////////////////////
const login = async (req, res) => {
  try {
    const { matricule, password } = req.body ?? {};
    const normalizedMatricule = typeof matricule === "string" ? matricule.trim() : "";

    if (!/^\d{10}$/.test(normalizedMatricule)) {
      return res.status(400).json({
        message: "Matricule invalide. Il faut exactement 10 chiffres.",
      });
    }

    if (typeof password !== "string" || !password) {
      return res.status(400).json({
        message: "Mot de passe requis.",
      });
    }

    const user = await findByMatricule(normalizedMatricule);

    if (!user) {
      return res.status(401).json({
        message: "Matricule ou mot de passe incorrect.",
      });
    }

    const isValidPassword = await verifyPassword(password, user.mot_de_passe);

    if (!isValidPassword) {
      return res.status(401).json({
        message: "Matricule ou mot de passe incorrect.",
      });
    }

    const token = jwt.sign(
      {
        matricule: user.matricule,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.status(200).json({
      message: "Connexion reussie.",
      token,
      user: {
        matricule: user.matricule,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        grade: user.grade || "",
        id_grade: user.id_grade || "",
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "Erreur serveur pendant l'authentification.",
    });
  }
};
///////////////////////////////////////////////
const requestReset = async (req, res) => {
  const email = (req.body?.email || "").trim().toLowerCase();
  if (!/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ message: "Email invalide." });
  }  

  try { 
    const exists = await checkEmailExists(email);

    if (!exists) {
      return res.status(404).json({ message: "Email introuvable." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_EXP_MINUTES * 60 * 1000);

    await upsertReset(email, token, expiresAt, pool);

    const appBaseUrl = getResetBaseUrl(req);
    const resetUrl = new URL("/forgot-password", `${appBaseUrl}/`);
    resetUrl.searchParams.set("token", token);
    resetUrl.searchParams.set("email", email);
    const link = resetUrl.toString();
    await sendResetEmail(email, link);

    return res.status(200).json({ message: "Lien de reinitialisation envoye." });
  } catch (error) {
    console.error("requestReset error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};
/////////////////////////////////////////////////
const resetPassword = async (req, res) => {
  const email = (req.body?.email || "").trim().toLowerCase();
  const { token, newPassword } = req.body || {};

  if (!token || !newPassword) {
    return res.status(400).json({ message: "Données invalides." });
  }

  if (!STRONG_PASSWORD_REGEX.test(newPassword)) {
    return res.status(400).json({
      message:
        "Mot de passe faible. Utilisez au moins 8 caracteres avec majuscule, minuscule, chiffre et symbole.",
    });
  }

  try {
    const resetRow = await findByEmail(email, pool);

    if (!resetRow || resetRow.token !== token || new Date(resetRow.expires_at) < new Date()) {
      return res.status(400).json({ message: "Lien invalide ou expiré." }  );
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await updatePassword(email, hashed);
    await deleteByEmail(email, pool);

    return res.json({ message: "Mot de passe mis a jour." });
  } catch (error) {
    console.error("resetPassword error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

module.exports = {
  login,
  requestReset,
  resetPassword,
};