const pool = require("../config/db");
const jwt = require("jsonwebtoken");
const { findAdminMatricule } = require("../models/utilisateurModel");
const { resolveTypeCongeIdByLabel } = require("../models/typesCongeModel");
const {
  ensureCongeStore,
  expirePendingConges,
  fetchApprovedCongesForYear,
  fetchConges,
  checkCongeOverlap,
  insertConge,
  getCongeById,
  updateCongeData,
  updateCongeStatusDB,
  updateCongeStatusAndEndDB,
  fetchCongesAdmin,
} = require("../models/congesModel");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

const STATUS_VALUES = Object.freeze({
  pending: "En attente",
  approved: "Approuvé",
  refused: "Refusé",
  canceled: "Annulé",
});

const ANNUAL_LEAVE_LIMIT_DAYS = 30;
const MIN_LEAD_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

const todayISO = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

const isValidDate = (value) => {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
};

const toISODate = (value) => {
  if (!isValidDate(value)) return "";
  return new Date(value).toISOString().slice(0, 10);
};

const normalizeText = (value = "") =>
  value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const isAnnualCongeLabel = (typeLabel = "") => {
  const type = normalizeText(typeLabel);
  return type.includes("conge annuel") || type === "annuel";
};
//ti7sib layamat bin deux dates
const daysBetweenIsoInclusive = (startIso, endIso) => {
  if (!startIso || !endIso) return 0;
  const startDate = new Date(startIso);
  const endDate = new Date(endIso);
  const diff = endDate.getTime() - startDate.getTime();
  if (!Number.isFinite(diff)) return 0;
  return Math.max(0, Math.floor(diff / DAY_MS) + 1);
};

const annualDaysWithinYear = (startValue, endValue, year) => {
  const startIso = toISODate(startValue);
  const endIso = toISODate(endValue);
  if (!startIso || !endIso || !Number.isFinite(year)) return 0;

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  if (startIso > yearEnd || endIso < yearStart) return 0;

  const overlapStart = startIso < yearStart ? yearStart : startIso;
  const overlapEnd = endIso > yearEnd ? yearEnd : endIso;
  return daysBetweenIsoInclusive(overlapStart, overlapEnd);
};

const normalizeStatus = (value = "") => {
  const normalized = value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (!normalized) return null;
  if (normalized.startsWith("en attente")) return STATUS_VALUES.pending;
  if (normalized.startsWith("approuv")) return STATUS_VALUES.approved;
  if (normalized.startsWith("refus")) return STATUS_VALUES.refused;
  if (normalized.startsWith("annul")) return STATUS_VALUES.canceled;
  return null;
};

const normalizeMatricule = (value) => {
  const digits = (value || "").toString().replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
};
//tjib token eli mawjoud fel header
const extractBearerToken = (req) => {
  const header = req.get?.("authorization") || req.headers?.authorization || "";
  const raw = Array.isArray(header) ? header[0] : String(header || "");
  const match = raw.match(/^\s*Bearer\s+(.+)\s*$/i);
  return match ? match[1] : "";
};

const extractJwtPayload = (req) => {
  const token = extractBearerToken(req);
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

const isAdminRole = (roleValue = "") =>
  roleValue
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("admin");

const resolveAdminMatricule = async (req, db = pool) => {
  const payload = extractJwtPayload(req);
  const jwtMatricule = normalizeMatricule(payload?.matricule || "");
  const jwtRole = String(payload?.role || "").trim();
  if (jwtMatricule && isAdminRole(jwtRole)) return jwtMatricule;

  const bodyCandidate = normalizeMatricule(
    req.body?.matriculeAdmin ?? req.body?.matricule_admin ?? req.body?.adminMatricule ?? ""
  );
  if (bodyCandidate) return bodyCandidate;

  return (await findAdminMatricule(db)) || null;
};

const addDaysToIso = (isoDate, daysToAdd) => {
  if (!isoDate || !Number.isFinite(daysToAdd)) return null;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + daysToAdd);
  return d.toISOString().slice(0, 10);
};

const isTruthy = (value) => value === true || value === 1 || value === "1" || value === "true";
// tnathaf data mt3 conge
const sanitizeCongeRow = (row = {}) => ({
  ...row,
  statut: normalizeStatus(row.statut) || row.statut || STATUS_VALUES.pending,
});

const shouldStampAdminMatricule = (normalizedStatus) =>
  normalizedStatus === STATUS_VALUES.approved || normalizedStatus === STATUS_VALUES.refused;
//tihsibb kadach min jour ilpersonnel 5tha fii conge annual fi 3am mo3ayen
const calculateUsedDaysForYear = async (matricule, year, excludeCongeId = null, db = pool) => {
  const rows = await fetchApprovedCongesForYear({ matricule, year, excludeCongeId }, db);
  return rows.reduce((sum, row) => {
    const typeLabel = String(row.type_conge_label || "").trim();
    const isAnnual = isAnnualCongeLabel(typeLabel);
    if (!isAnnual) return sum;
    return sum + annualDaysWithinYear(row.date_debut, row.date_fin, year);
  }, 0);
};

const listConges = async (req, res) => {
  try {
    await ensureCongeStore(pool);
    await expirePendingConges(todayISO(), pool);
    const matricule = normalizeMatricule(req.query.matricule);

    const rows = await fetchConges(matricule, pool);
    return res.json(rows.map(sanitizeCongeRow));
  } catch (error) {
    console.error("listConges error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const createConge = async (req, res) => {
  try {
    await ensureCongeStore(pool);
    const {
      matricule,
      type_conge_id,
      type,
      date_debut,
      date_fin,
      raison,
      statut = STATUS_VALUES.pending,
    } = req.body ?? {};

    const normalizedMatricule = normalizeMatricule(matricule);
    if (!normalizedMatricule) {
      return res.status(400).json({ message: "Matricule invalide (10 chiffres requis)." });
    }

    if (!isValidDate(date_debut) || !isValidDate(date_fin)) {
      return res.status(400).json({ message: "Dates invalides." });
    }
    const startIso = toISODate(date_debut);
    const endIso = toISODate(date_fin);
    const minIso = addDaysToIso(todayISO(), MIN_LEAD_DAYS);

    if (minIso && startIso < minIso) {
      return res.status(400).json({ message: `La date de début doit être au moins ${MIN_LEAD_DAYS} jours à l'avance.` });
    }

    if (new Date(endIso) < new Date(startIso)) {
      return res.status(400).json({ message: "La date de fin doit être après la date de début." });
    }

    const safeRaison = String(raison || "").trim();
    if (!safeRaison) {
      return res.status(400).json({ message: "Raison requise." });
    }

    const status = normalizeStatus(statut) || STATUS_VALUES.pending;
    const adminMatricule = shouldStampAdminMatricule(status) ? await resolveAdminMatricule(req, pool) : null;

    let resolvedTypeId = null;
    if (typeof type_conge_id !== "undefined" && type_conge_id !== null && type_conge_id !== "") {
      const numeric = Number(type_conge_id);
      resolvedTypeId = Number.isFinite(numeric) ? numeric : null;
    }

    if (!resolvedTypeId && typeof type !== "undefined") {
      resolvedTypeId = await resolveTypeCongeIdByLabel(type, pool);
    }

    const hasOverlap = await checkCongeOverlap(normalizedMatricule, startIso, endIso, null, pool);
    if (hasOverlap) {
      return res.status(409).json({ message: "Un congé existe déjà sur cette période." });
    }

    try {
      const insertedRow = await insertConge(
        normalizedMatricule,
        resolvedTypeId,
        startIso,
        endIso,
        safeRaison,
        status,
        adminMatricule,
        pool
      );
      const inserted = sanitizeCongeRow(insertedRow || {});

      return res.status(201).json(inserted);
    } catch (insertError) {
      if (insertError?.code === "23503") { 
        return res.status(400).json({ message: "Type de congé ou matricule invalide." });
      }
      throw insertError;
    }

  } catch (error) {
    console.error("createConge error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const updateCongeStatus = async (req, res) => {
  try {
    await ensureCongeStore(pool);
    const id = Number.parseInt(req.params.id, 10);
    const { statut, matricule, type_conge_id, type, date_debut, date_fin, raison, adjust_to_remaining } = req.body ?? {};
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "Identifiant invalide." });
    }

    const hasEditFields =
      typeof matricule !== "undefined" ||
      typeof type_conge_id !== "undefined" ||
      typeof type !== "undefined" ||
      typeof date_debut !== "undefined" ||
      typeof date_fin !== "undefined" ||
      typeof raison !== "undefined";

    const current = await getCongeById(id, pool);
    if (!current) {
      return res.status(404).json({ message: "Congé introuvable." });
    }

    if (hasEditFields) {
      if (normalizeStatus(current.statut) !== STATUS_VALUES.pending) {
        return res.status(400).json({ message: "Seules les demandes en attente peuvent être modifiées." });
      }

      const providedMatricule = normalizeMatricule(matricule ?? current.matricule);
      if (!providedMatricule) {
        return res.status(400).json({ message: "Matricule invalide (10 chiffres requis)." });
      }
      if (typeof matricule !== "undefined" && providedMatricule !== current.matricule) {
        return res.status(403).json({ message: "Vous ne pouvez modifier que vos demandes." });
      }

      const nextStart = date_debut ?? current.date_debut;
      const nextEnd = date_fin ?? current.date_fin;
      if (!isValidDate(nextStart) || !isValidDate(nextEnd)) {
        return res.status(400).json({ message: "Dates invalides." });
      }

      const startIso = toISODate(nextStart);
      const endIso = toISODate(nextEnd);
      const minIso = addDaysToIso(todayISO(), MIN_LEAD_DAYS);

      if (minIso && startIso < minIso) {
        return res.status(400).json({ message: `La date de début doit être au moins ${MIN_LEAD_DAYS} jours à l'avance.` });
      }
      if (new Date(endIso) < new Date(startIso)) {
        return res.status(400).json({ message: "La date de fin doit être après la date de début." });
      }

      const raisonRaw = typeof raison === "undefined" ? current.raison : raison;
      const safeRaison = String(raisonRaw || "").trim();
      if (!safeRaison) {
        return res.status(400).json({ message: "Raison requise." });
      }

      let nextTypeId = current.type_conge_id ?? null;

      if (typeof type_conge_id !== "undefined" && type_conge_id !== null && type_conge_id !== "") {
        const numeric = Number(type_conge_id);
        nextTypeId = Number.isFinite(numeric) ? numeric : null;
      }

      if (!nextTypeId && typeof type !== "undefined") {
        nextTypeId = await resolveTypeCongeIdByLabel(type, pool);
      }

      const hasOverlap = await checkCongeOverlap(providedMatricule, startIso, endIso, id, pool);
      if (hasOverlap) {
        return res.status(409).json({ message: "Un congé existe déjà sur cette période." });
      }

      try {
        const editedRow = await updateCongeData(
          id,
          providedMatricule,
          nextTypeId,
          startIso,
          endIso,
          safeRaison,
          null,
          pool
        );
        const updated = sanitizeCongeRow(editedRow || {});
        return res.json(updated);
      } catch (updateError) {
        if (updateError?.code === "23503") { 
          return res.status(400).json({ message: "Type de congé ou matricule invalide." });
        }
        throw updateError;
      }
    }

    const normalizedStatus = normalizeStatus(statut);
    if (!normalizedStatus) {
      return res
        .status(400)
        .json({ message: "Statut invalide. Utilisez En attente, Approuvé, Refusé ou Annulé." });
    }

    const adminMatricule = shouldStampAdminMatricule(normalizedStatus) ? await resolveAdminMatricule(req, pool) : null;

    const currentTypeLabel = String(current.type_conge_label || "").trim();

    if (normalizedStatus === STATUS_VALUES.approved && isAnnualCongeLabel(currentTypeLabel)) {
      const startIso = toISODate(current.date_debut);
      const endIso = toISODate(current.date_fin);
      const year = Number.parseInt(startIso.slice(0, 4), 10);
      const requestedDays = annualDaysWithinYear(startIso, endIso, year);
      
      const usedDays = await calculateUsedDaysForYear(current.matricule, year, id, pool);
      
      const remainingDays = Math.max(0, ANNUAL_LEAVE_LIMIT_DAYS - usedDays);

      if (requestedDays > remainingDays) {
        const shouldAdjust = isTruthy(adjust_to_remaining);
        if (shouldAdjust && remainingDays > 0) {
          const adjustedEndIso = addDaysToIso(startIso, remainingDays - 1);
          
          const adjustedRow = await updateCongeStatusAndEndDB(
            id,
            normalizedStatus,
            adjustedEndIso,
            adminMatricule,
            pool
          );
          const responseRow = sanitizeCongeRow(adjustedRow);

          responseRow.annual_adjustment = {
            applied: true,
            year,
            maxDays: ANNUAL_LEAVE_LIMIT_DAYS,
            usedDays,
            remainingDays,
            requestedDays,
            approvedDays: remainingDays,
            originalEndDate: endIso,
            adjustedEndDate: adjustedEndIso,
          };
          return res.json(responseRow);
        }

        const suggestedEndDate = remainingDays > 0 ? addDaysToIso(startIso, remainingDays - 1) : null;
        const reason =
          remainingDays <= 0
            ? `Solde de congé annuel épuisé pour ${year} (${usedDays}/${ANNUAL_LEAVE_LIMIT_DAYS} jours déjà approuvés).`
            : `Solde annuel insuffisant pour ${year}: ${remainingDays} jour(s) restant(s) sur ${ANNUAL_LEAVE_LIMIT_DAYS}.`;

        return res.status(409).json({
          message: `${reason} La demande couvre ${requestedDays} jour(s).`,
          code: "ANNUAL_BALANCE_EXCEEDED",
          details: {
            year,
            maxDays: ANNUAL_LEAVE_LIMIT_DAYS,
            usedDays,
            remainingDays,
            requestedDays,
            suggestedEndDate,
          },
        });
      }
    }

    const row = await updateCongeStatusDB(id, normalizedStatus, adminMatricule, pool);
    const responseRow = sanitizeCongeRow(row || {});

    return res.json(responseRow);
  } catch (error) {
    console.error("updateCongeStatus error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const listCongesAdmin = async (_req, res) => {
  try {
    await ensureCongeStore(pool);
    await expirePendingConges(todayISO(), pool);
    const rows = await fetchCongesAdmin(pool);
    return res.json(rows.map(sanitizeCongeRow));
  } catch (error) {
    console.error("listCongesAdmin error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const getCongeBalance = async (req, res) => {
  try {
    await ensureCongeStore(pool);
    const matricule = normalizeMatricule(req.query.matricule);
    const yearRaw = req.query.year;
    const nowYear = new Date().getFullYear();
    const year = yearRaw ? Number.parseInt(String(yearRaw), 10) : nowYear;

    if (!matricule) {
      return res.status(400).json({ message: "Matricule invalide (10 chiffres requis)." });
    }
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ message: "Année invalide." });
    }

    const usedDays = await calculateUsedDaysForYear(matricule, year, null, pool);
    
    const remainingDays = Math.max(0, ANNUAL_LEAVE_LIMIT_DAYS - usedDays);

    return res.json({
      matricule,
      year,
      usedDays,
      remainingDays,
      maxDays: ANNUAL_LEAVE_LIMIT_DAYS,
    });
  } catch (error) {
    console.error("getCongeBalance error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

module.exports = {
  listConges,
  createConge,
  updateCongeStatus,
  listCongesAdmin,
  getCongeBalance,
};