const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const { findByMatricule } = require("../models/utilisateurModel");
const { findGradeById, findGradeByLabel } = require("../models/gradeModel");
const payrollModel = require("../models/payrollModel");
const attendanceModel = require("../models/attendanceModel");
const planningModel = require("../models/planningModel");
const { getTableColumns, getUtilisateurColumns } = require("../models/dbUtils");
const { getServiceStore } = require("../models/serviceModel");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const DEFAULT_BASE_HOURS_PER_MONTH = 173.33;

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

const normalizeMatricule = (value) => (String(value || "").match(/\d/g) || []).join("").slice(0, 10);

const isAdminRole = (role) => String(role || "").toLowerCase().includes("admin");

const resolveCaller = (req) => {
  const payload = extractJwtPayload(req);
  const jwtMatricule = normalizeMatricule(payload?.matricule || "");
  const jwtRole = String(payload?.role || "").trim();

  const requestedMatricule =
    normalizeMatricule(req.body?.matricule || "") || normalizeMatricule(req.query?.matricule || "");

  if (isAdminRole(jwtRole) && requestedMatricule) {
    return { matricule: requestedMatricule, role: jwtRole };
  }

  return { matricule: jwtMatricule, role: jwtRole };
};

const requireMatricule = (matricule, res) => {
  if (!matricule || matricule.length !== 10) {
    res.status(401).json({ message: "Non autorise: matricule manquant." });
    return false;
  }
  return true;
};
//t7awil lilfloat
const parseNumber = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};
//t7awil lilint
const parseIntSafe = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number.parseInt(String(value), 10);
  return Number.isInteger(n) ? n : fallback;
};

const normalizeShift = (value) => {
  const raw = (value || "").toString().trim();
  if (!raw) return null;
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (normalized.startsWith("matin")) return "Matin";
  if (normalized.includes("apres")) return "Apres-midi";
  if (normalized.includes("garde")) return "Garde";
  return null;
};

const normalizePlanningType = (value) => {
  const raw = (value || "").toString().trim();
  if (!raw) return null;
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (normalized === "apres midi") return "Apres-midi";
  if (normalized.startsWith("matin")) return "Matin";
  if (normalized.includes("apres")) return "Apres-midi";
  if (normalized.includes("garde")) return "Garde";
  return null;
};

const normalizeShiftKey = (value) =>
  String(value || "")
    .toString()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");

const currentMonthYear = () => {
  const d = new Date();
  return { mois: d.getMonth() + 1, annee: d.getFullYear() };
};

const resolveMonthYear = (req) => {
  const mois =
    parseIntSafe(req.query?.mois ?? req.query?.month ?? req.body?.mois ?? req.body?.month, null) ??
    currentMonthYear().mois;
  const annee =
    parseIntSafe(req.query?.annee ?? req.query?.year ?? req.body?.annee ?? req.body?.year, null) ??
    currentMonthYear().annee;
  return { mois, annee };
};
//t7awal 1.2345 → 1234.5
const round3 = (value) => Math.round((parseNumber(value, 0) + Number.EPSILON) * 1000) / 1000;

const parseTimeToMinutes = (value) => {
  const raw = String(value || "").slice(0, 5);
  const match = raw.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const h = Number.parseInt(match[1], 10);
  const m = Number.parseInt(match[2], 10);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
};
//tala3 hasib swayi3 chniya shift 
const inferShiftTypeFromMinutes = (minutes) => {
  if (minutes === null || minutes === undefined) return null;
  const h = Math.floor(Number(minutes) / 60) % 24;
  if (!Number.isFinite(h)) return null;
  if (h >= 4 && h < 13) return "Matin";
  if (h >= 13 && h < 20) return "Apres-midi";
  return "Garde";
};

const inferShiftTypeFromTime = (value) => {
  const minutes = parseTimeToMinutes(value);
  return minutes === null ? null : inferShiftTypeFromMinutes(minutes);
};

const inferShiftTypeFromDateTime = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return inferShiftTypeFromMinutes(d.getHours() * 60 + d.getMinutes());
};
//tihsib 3dad swayi3 bin debut et fin
const computeShiftHoursFromTimes = (start, end) => {
  const startMin = parseTimeToMinutes(start);
  const endMin = parseTimeToMinutes(end);
  if (startMin === null || endMin === null) return 0;
  let diff = endMin - startMin;
  if (diff < 0) diff += 24 * 60;
  return diff / 60;
};

const toIsoDateOnly = (value) => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const addDaysIso = (iso, days) => {
  const date = new Date(`${toIsoDateOnly(iso)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const getMonthWindowIso = ({ mois, annee }) => {
  const m = Number.parseInt(String(mois), 10);
  const y = Number.parseInt(String(annee), 10);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { startIso: start.toISOString().slice(0, 10), endIso: end.toISOString().slice(0, 10) };
};

const resolvePlanningIdColumn = (cols) => {
  const candidates = ["id", "id_planning", "planning_id"];
  return candidates.find((c) => cols.has(c)) || "id";
};

const fetchPlanningRowsForMatricule = async ({ matricule }, db = pool) => {
  const store = await planningModel.ensurePlanningStore(db).catch(() => null);
  if (!store?.table) return [];
  const serviceStore = await getServiceStore(db).catch(() => null);
  const planningCols = await getTableColumns(store.table, db).catch(() => new Set());
  const planningIdCol = resolvePlanningIdColumn(planningCols);
  const userCols = await getUtilisateurColumns(db).catch(() => []);
  return planningModel.fetchPlanningRows(
    {
      table: store.table,
      planningIdCol,
      planningCols,
      serviceStore,
      userCols,
      matriculeFilter: matricule,
    },
    db
  );
};

const computeExpectedHoursFromPlanning = async ({ matricule, mois, annee }, db = pool) => {
  const { startIso, endIso } = getMonthWindowIso({ mois, annee });
  await payrollModel.ensurePayrollStores(db);
  const shiftRows = await payrollModel.listTypeShift(db).catch(() => []);
  const shiftMetaById = new Map(
    shiftRows
      .filter((r) => r?.id !== null && r?.id !== undefined)
      .map((r) => [
        Number(r.id),
        { hours: Number(r.nb_heures) || 0, typeShift: String(r.type_shift || "").trim() || null },
      ])
  );
  const shiftMetaByKey = new Map(
    shiftRows
      .filter((r) => r?.type_shift)
      .map((r) => [
        normalizeShiftKey(r.type_shift),
        { hours: Number(r.nb_heures) || 0, typeShift: String(r.type_shift || "").trim() || null },
      ])
  );
  const rows = await fetchPlanningRowsForMatricule({ matricule }, db);

  const expectedByDate = new Map();
  const plannedTypeByDate = new Map();
  for (const row of rows) {
    const startDate = toIsoDateOnly(row.date);
    const endDate = toIsoDateOnly(row.date_fin || row.date);
    if (!startDate) continue;
    if (startDate >= endIso || endDate < startIso) continue;

    let hours = 0;
    let plannedType = null;
    const shiftId = Number(row.type_shift_id);
    if (Number.isFinite(shiftId) && shiftMetaById.has(shiftId)) {
      const meta = shiftMetaById.get(shiftId);
      hours = Number(meta?.hours) || 0;
      plannedType = normalizeShift(meta?.typeShift || "") || null;
    } else {
      const rawType = row.type || "";
      const normalizedPlanning = normalizePlanningType(rawType);
      const planningKey = normalizeShiftKey(normalizedPlanning || "");
      if (planningKey && shiftMetaByKey.has(planningKey)) {
        const meta = shiftMetaByKey.get(planningKey);
        hours = Number(meta?.hours) || 0;
        plannedType = normalizeShift(meta?.typeShift || "") || null;
      } else {
        const key = normalizeShiftKey(rawType);
        if (shiftMetaByKey.has(key)) {
          const meta = shiftMetaByKey.get(key);
          hours = Number(meta?.hours) || 0;
          plannedType = normalizeShift(meta?.typeShift || "") || null;
        } else {
          const normalizedType = normalizeShift(rawType);
          const normalizedKey = normalizeShiftKey(normalizedType || "");
          if (normalizedKey && shiftMetaByKey.has(normalizedKey)) {
            const meta = shiftMetaByKey.get(normalizedKey);
            hours = Number(meta?.hours) || 0;
            plannedType = normalizeShift(meta?.typeShift || "") || null;
          } else {
            
          hours = computeShiftHoursFromTimes(row.start_time, row.end_time);
          plannedType = inferShiftTypeFromTime(row.start_time) || null;
          }
        }
      }
    }
    if (!hours) continue;

    const loopStart = startDate < startIso ? startIso : startDate;
    const loopEnd = endDate >= endIso ? addDaysIso(endIso, -1) : endDate;

    let cur = loopStart;
    while (cur && cur <= loopEnd) {
      expectedByDate.set(cur, (expectedByDate.get(cur) || 0) + hours);
      if (plannedType) {
        const prev = plannedTypeByDate.get(cur);
        if (prev === undefined) plannedTypeByDate.set(cur, plannedType);
        else if (prev !== plannedType) plannedTypeByDate.set(cur, null);
      }
      cur = addDaysIso(cur, 1);
    }
  }

  const totalExpected = Array.from(expectedByDate.values()).reduce((sum, v) => sum + (Number(v) || 0), 0);
  return { totalExpected: round3(totalExpected), expectedByDate, plannedTypeByDate };
};

const getBaseSalaryForMatricule = async (matricule, db = pool) => {
  const user = await findByMatricule(matricule, db);
  if (!user) return { user: null, salaireBase: 0, grade: null };

  let gradeRow = null;
  const gradeId = Number.parseInt(String(user.id_grade || "").trim() || "0", 10);
  if (Number.isFinite(gradeId) && gradeId > 0) {
    gradeRow = await findGradeById(gradeId, db);
  } else if (user.grade) {
    gradeRow = await findGradeByLabel(String(user.grade || "").trim(), db);
  }

  const salaireBase = parseNumber(gradeRow?.salaire, 0) || 0;
  return { user, salaireBase, grade: gradeRow };
};

const computeFichePaie = async ({ matricule, mois, annee }, db = pool) => {
  await payrollModel.ensurePayrollStores(db);

  const { user, salaireBase: originalSalaireBase, grade } = await getBaseSalaryForMatricule(matricule, db);

  let salaireBase = originalSalaireBase;
  let prorationFactor = 1.0;
  let embaucheIso = null;

  if (user && user.date_embauche) {
    const embauche = new Date(user.date_embauche);
    if (!Number.isNaN(embauche.getTime())) {
      embaucheIso = embauche.toISOString().slice(0, 10);
      const embaucheY = embauche.getFullYear();
      const embaucheM = embauche.getMonth() + 1;

      if (annee < embaucheY || (annee === embaucheY && mois < embaucheM)) {
        throw new Error("Impossible de generer une fiche de paie avant le mois d'embauche.");
      }

      if (annee === embaucheY && mois === embaucheM) {
        const lastDay = new Date(annee, mois, 0).getDate();
        const startDay = embauche.getDate();
        const daysWorked = Math.max(0, lastDay - startDay + 1);
        prorationFactor = daysWorked / lastDay;//tihsib pourcentage mt3 ayamet lkhedma fi chhar
        salaireBase = originalSalaireBase * prorationFactor;
      }
    }
  }

  const baseHoursPerMonth = parseNumber(process.env.PAYROLL_BASE_HOURS_PER_MONTH, DEFAULT_BASE_HOURS_PER_MONTH);
  const proratedBaseHours = baseHoursPerMonth * prorationFactor;//ti7sib swayi3 ilmotwak3in hassib chhar 

  const { totalExpected, expectedByDate, plannedTypeByDate } = await computeExpectedHoursFromPlanning(
    { matricule, mois, annee },
    db
  );
  
  if (embaucheIso) {
    for (const key of expectedByDate.keys()) {
      if (key < embaucheIso) {
        expectedByDate.delete(key);
        plannedTypeByDate.delete(key);
      }
    }
  }

  const expectedHours = Array.from(expectedByDate.values()).reduce((sum, v) => sum + (Number(v) || 0), 0);//calcul total heures lmetwa93a fi shhar(men planning)
  const expectedHoursForRate = expectedHours > 0 ? expectedHours : proratedBaseHours;//yshouf benhi bsh yekhdem
  const tauxHoraire = expectedHoursForRate > 0 ? salaireBase / expectedHoursForRate : 0;

  const sessions = await attendanceModel.listWorkSessionsForMonth({ matricule, mois, annee }, db);
  const workedByDate = new Map();
  const firstCheckInByDate = new Map();
  for (const s of sessions) {
    const dateIso = toIsoDateOnly(s.date);
    if (!dateIso) continue;
    if (embaucheIso && dateIso < embaucheIso) continue;
    const hrs = Number(s.hours_worked) || 0;
    workedByDate.set(dateIso, (workedByDate.get(dateIso) || 0) + hrs);

    const checkIn = s.check_in_time ? new Date(s.check_in_time) : null;
    if (checkIn && !Number.isNaN(checkIn.getTime())) {
      const prev = firstCheckInByDate.get(dateIso);
      if (!prev || checkIn < prev) firstCheckInByDate.set(dateIso, checkIn);
    }
  }

  const workedHours = round3(Array.from(workedByDate.values()).reduce((sum, v) => sum + (Number(v) || 0), 0));

  const typeShiftRows = await payrollModel.listTypeShift(db).catch(() => []);
  const coeffByTypeKey = new Map(
    typeShiftRows
      .filter((r) => r?.type_shift)
      .map((r) => [normalizeShiftKey(r.type_shift), parseNumber(r.coefficient, 1.0) ?? 1.0])
  );

  const allDates = new Set([...Array.from(expectedByDate.keys()), ...Array.from(workedByDate.keys())]);
  const sortedDates = Array.from(allDates.values()).sort();

  let missingHours = 0;
  let totalHeuresSupp = 0;
  let totalGainSupp = 0;
  const lignes = [];

  for (const dateIso of sortedDates) {
    if (embaucheIso && dateIso < embaucheIso) continue;

    const exp = Number(expectedByDate.get(dateIso)) || 0;
    const done = Number(workedByDate.get(dateIso)) || 0;

    if (exp > done) missingHours += exp - done;
    if (done <= exp) continue;

    const overtimeHours = done - exp;
    const plannedType = plannedTypeByDate.get(dateIso) || null;
    const inferred = plannedType ? null : inferShiftTypeFromDateTime(firstCheckInByDate.get(dateIso) || null);
    const typeShift = plannedType || inferred || "Inconnu";

    const coeff =
      typeof typeShift === "string" && typeShift !== "Inconnu"
        ? coeffByTypeKey.get(normalizeShiftKey(typeShift)) ?? 1.0
        : 1.0;

    const gain = overtimeHours * coeff * tauxHoraire;
    totalHeuresSupp += overtimeHours;
    totalGainSupp += gain;

    lignes.push({
      id: null,
      date: dateIso,
      heures: round3(overtimeHours),
      type_shift: typeShift,
      coefficient: round3(coeff),
      gain: round3(gain),
    });
  }

  if (expectedHours === 0) {
    missingHours = Math.max(0, proratedBaseHours - workedHours);
    lignes.length = 0;
    totalHeuresSupp = 0;
    totalGainSupp = 0;

    if (workedHours > proratedBaseHours) {
      totalHeuresSupp = workedHours - proratedBaseHours;
      totalGainSupp = totalHeuresSupp * tauxHoraire;
      lignes.push({
        id: null,
        date: sortedDates[sortedDates.length - 1] || new Date().toISOString().slice(0, 10),
        heures: round3(totalHeuresSupp),
        type_shift: "Heures Supp.",
        coefficient: 1.0,
        gain: round3(totalGainSupp),
      });
    }
  }

  totalHeuresSupp = round3(totalHeuresSupp);
  totalGainSupp = round3(totalGainSupp);
  missingHours = round3(Math.max(0, missingHours));

  const deductions = round3(missingHours * tauxHoraire);
  let salaireNet = round3(salaireBase + totalGainSupp - deductions);
  if (salaireNet < 0) salaireNet = 0;

  const fiche = await payrollModel.upsertFichePaie(
    {
      matricule,
      mois,
      annee,
      totalHeuresPrevues: round3(expectedHours),
      totalHeuresReelles: workedHours,
      heuresManquantes: missingHours,
      totalHeuresSupp,
      totalGainSupp,
      deductions,
      tauxHoraire: round3(tauxHoraire),
      salaireBase: round3(salaireBase),
      salaireNet,
    },
    db
  );

  return {
    fiche: {
      id: fiche?.id ?? null,
      matricule,
      mois,
      annee,
      salaire_base: round3(salaireBase),
      taux_horaire: round3(tauxHoraire),
      heures_prevues: round3(expectedHours),
      heures_travaillees: workedHours,
      heures_manquantes: missingHours,
      total_heures_prevues: round3(expectedHours),
      total_heures_reelles: workedHours,
      total_heures_supp: totalHeuresSupp,
      total_gain_supp: totalGainSupp,
      deductions,
      total_deductions: deductions,
      salaire_net: salaireNet,
      generated_at: fiche?.generated_at || null,
      grade: grade?.type_de_grade || grade?.label || grade?.type_shift || null,
    },
    heures_supp: lignes,
  };
};
//yjib les fiche de paie l9dom 
const getFichePaie = async (req, res) => {
  try {
    const { matricule } = resolveCaller(req);
    if (!requireMatricule(matricule, res)) return;

    const { mois, annee } = resolveMonthYear(req);
    if (!Number.isInteger(mois) || mois < 1 || mois > 12) {
      return res.status(400).json({ message: "Mois invalide (1..12)." });
    }
    if (!Number.isInteger(annee) || annee < 1900 || annee > 2200) {
      return res.status(400).json({ message: "Annee invalide." });
    }

    const result = await computeFichePaie({ matricule, mois, annee }, pool);
    return res.json(result);
  } catch (error) {
    console.error("getFichePaie error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

module.exports = {
  getFichePaie,
};