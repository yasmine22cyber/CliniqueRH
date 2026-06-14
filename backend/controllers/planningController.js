const pool = require("../config/db");
const jwt = require("jsonwebtoken");
const { findAdminMatricule } = require("../models/utilisateurModel");
const planningModel = require("../models/planningModel");
const { ensurePlanningStore } = planningModel;
const {
  getPlanningRequestStore,
  ensurePlanningRequestStore,
  REQUEST_PLANNING_FK_COLS,
} = require("../models/planningRequestsModel");
const {
  getServiceStore,
  getTableColumns,
  resolveServiceId,
  resolveServiceNameById,
} = require("../models/serviceModel");
const { getUtilisateurColumns } = require("../models/dbUtils");
const { getGradeRestrictionKeys } = require("../models/gradeModel");
const typeShiftModel = require("../models/typeShiftModel");
const { checkApprovedCongeOverlap } = require("../models/congesModel");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
//tnathaf wakit (08:30:00 => 08:30)
const normalizeTime = (value) => (value ? String(value).slice(0, 5) : "");

const listTypeShift = async (_req, res) => {
  try {
    const rows = await typeShiftModel.listTypeShift(pool);
    return res.json(rows);
  } catch (error) {
    console.error("planning listTypeShift error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

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

const TYPE_RULES = {
  matin: { start: "07:00", end: "14:00" },
  "apres-midi": { start: "14:00", end: "19:00" },
  garde: { start: "19:00", end: "07:00" },
};
const ALLOWED_TYPE_KEYS = new Set(["matin", "apres-midi", "garde"]);

const SHIFT_LABELS = {
  matin: "Matin",
  "apres-midi": "Apres-midi",
  garde: "Garde",
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PLANNING_ID_COLS = ["id", "id_planning"];

const resolvePlanningIdColumn = (cols = new Set()) =>
  PLANNING_ID_COLS.find((col) => cols.has(col)) || "id";

const buildPlanningInsertQuery = ({
  table,
  cols,
  idCol = "id",
  matricule,
  adminMatricule,
  serviceId,
  serviceName,
  dateStart,
  dateEnd,
  startTime,
  endTime,
  type,
  typeShiftId,
  notes,
}) => {
  const hasSeries = Boolean(dateEnd && dateEnd !== dateStart);
  const params = [];
  const addParam = (value, cast = "") => {
    params.push(value);
    const placeholder = `$${params.length}`;
    return cast ? `${placeholder}::${cast}` : placeholder;
  };

  const insertCols = [];
  const valueExprs = [];
  const push = (col, expr) => {
    if (!cols.has(col)) return;
    insertCols.push(col);
    valueExprs.push(expr);
  };

  const DATE_COLS = ["date", "date_debut", "date_debut_planning"];
  const DATE_FIN_COLS = ["date_fin", "date_fin_planning"];
  const SERVICE_ID_COLS = ["id_service", "service_id"];
  const SERVICE_NAME_COLS = ["service", "service_planning"];
  const START_TIME_COLS = ["start_time", "heure_debut", "heure_debut_planning"];
  const END_TIME_COLS = ["end_time", "heure_fin", "heure_fin_planning"];
  const TYPE_COLS = ["type", "type_planning"];
  const SHIFT_ID_COLS = ["type_shift_id", "shift_id"];

  const needsDate = DATE_COLS.some((c) => cols.has(c));
  const needsDateFin = DATE_FIN_COLS.some((c) => cols.has(c));
  const needsServiceId = SERVICE_ID_COLS.some((c) => cols.has(c));
  const needsServiceName = SERVICE_NAME_COLS.some((c) => cols.has(c));
  const needsStartTime = START_TIME_COLS.some((c) => cols.has(c));
  const needsEndTime = END_TIME_COLS.some((c) => cols.has(c));
  const needsType = TYPE_COLS.some((c) => cols.has(c));
  const needsShiftId = SHIFT_ID_COLS.some((c) => cols.has(c));

  let withClause = "";
  let fromClause = "";
  let dateExpr = "";
  let dateFinExpr = "";

  if (hasSeries) {
    const seriesStartExpr = addParam(dateStart, "date");
    const seriesEndExpr = addParam(dateEnd, "date");
    withClause = `WITH dates AS (SELECT generate_series(${seriesStartExpr}, ${seriesEndExpr}, interval '1 day') AS d)`;
    fromClause = "FROM dates";
    if (needsDate) dateExpr = "d::date";
    if (needsDateFin) dateFinExpr = "d::date";
  } else {
    if (needsDate) dateExpr = addParam(dateStart, "date");
    if (needsDateFin) dateFinExpr = addParam(dateEnd || dateStart, "date");
  }

  const matriculeExpr = addParam(matricule);
  const adminMatriculeExpr = cols.has("matricule_admin") ? addParam(adminMatricule || null) : "";
  const serviceIdExpr = needsServiceId ? addParam(serviceId, "int") : "";
  const serviceNameExpr = needsServiceName ? addParam(serviceName || null) : "";
  const startTimeExpr = needsStartTime ? addParam(startTime, "time") : "";
  const endTimeExpr = needsEndTime ? addParam(endTime, "time") : "";
  const typeExpr = needsType ? addParam(type) : "";
  const shiftIdExpr = needsShiftId ? addParam(typeShiftId ?? null, "int") : "";
  const notesExpr = cols.has("notes") ? addParam(notes || null) : "";

  push("matricule", matriculeExpr);
  push("matricule_admin", adminMatriculeExpr);
  SERVICE_ID_COLS.forEach((c) => push(c, serviceIdExpr));
  SERVICE_NAME_COLS.forEach((c) => push(c, serviceNameExpr));
  DATE_COLS.forEach((c) => push(c, dateExpr));
  DATE_FIN_COLS.forEach((c) => push(c, dateFinExpr));
  START_TIME_COLS.forEach((c) => push(c, startTimeExpr));
  END_TIME_COLS.forEach((c) => push(c, endTimeExpr));
  TYPE_COLS.forEach((c) => push(c, typeExpr));
  SHIFT_ID_COLS.forEach((c) => push(c, shiftIdExpr));
  push("notes", notesExpr);
  if (cols.has("created_at")) {
    push("created_at", "NOW()");
  }

  if (!insertCols.length) {
    return { text: "", values: [], error: "Impossible de creer un planning: schema invalide." };
  }

  const head = hasSeries ? `${withClause}\n` : "";
  const insertSql = `INSERT INTO ${table} (${insertCols.join(", ")})`;
  const valuesSql = hasSeries
    ? `SELECT ${valueExprs.join(", ")} ${fromClause}`
    : `VALUES (${valueExprs.join(", ")})`;

  return {
    text: `${head}${insertSql}\n${valuesSql}\nRETURNING ${idCol} AS id`,
    values: params,
    error: null,
  };
};

const PLANNING_START_DATE_COLS = ["date", "date_debut", "date_debut_planning"];
const PLANNING_END_DATE_COLS = ["date_fin", "date_fin_planning"];

//tchof asque planning jay dans deux periode (08/10/2024 - 10/10/2024) w (09/10/2024 - 11/10/2024) kan haka manah overlap
const buildPlanningOverlapClause = (alias, cols, startParam, endParam) => {
  const startCols = PLANNING_START_DATE_COLS.filter((c) => cols.has(c));
  if (!startCols.length) return "";
  const endCols = PLANNING_END_DATE_COLS.filter((c) => cols.has(c));
  return startCols
    .map((startCol) => {
      const endExpr = endCols.length
        ? `COALESCE(${endCols.map((c) => `${alias}.${c}`).join(", ")}, ${alias}.${startCol})`
        : `${alias}.${startCol}`;
      return `(${alias}.${startCol} <= ${endParam}::date AND ${endExpr} >= ${startParam}::date)`;
    })
    .join(" OR ");
};
const hasPlanningOverlap = async ({ table, cols, matricule, startIso, endIso, db = pool }) => {
  if (!table || !matricule || !startIso || !endIso) return false;
  const clause = buildPlanningOverlapClause("p", cols, "$2", "$3");
  if (!clause) return false;
  return planningModel.hasPlanningOverlapDB({ table, overlapClause: clause, matricule, startIso, endIso }, db);
};

const normalizeTypeKey = (value) => {
  const raw = (value || "").toString().trim().toLowerCase();
  if (!raw) return "";
  const noAccent = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const compact = noAccent.replace(/\s+/g, " ").trim();
  if (compact === "apres midi") return "apres-midi";
  return compact;
};

const normalizeRoleKey = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeMatriculeDigits = (value = "") => String(value || "").replace(/\D/g, "").slice(0, 10);

const resolveAdminMatricule = async (req, db = pool) => {
  const payload = extractJwtPayload(req);
  const jwtMatricule = normalizeMatriculeDigits(payload?.matricule || "");
  const jwtRole = normalizeRoleKey(payload?.role || "");
  if (/^\d{10}$/.test(jwtMatricule) && jwtRole.includes("admin")) return jwtMatricule;

  const bodyCandidate = normalizeMatriculeDigits(
    req.body?.matriculeAdmin ?? req.body?.matricule_admin ?? req.body?.adminMatricule ?? ""
  );
  if (/^\d{10}$/.test(bodyCandidate)) return bodyCandidate;
  return (await findAdminMatricule(db)) || null;
};

const normalizeLabel = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const isGynecologueGrade = (value = "") => normalizeLabel(value).includes("gynecolog");
//lilpersonnel ili maynajamich yikhdem garde 
const getRestrictionSets = async (db = pool) => {
  const payload = await getGradeRestrictionKeys(db).catch(() => ({
    night_restricted: [],
  }));
  return {
    nightRestricted: new Set(payload.night_restricted || []),
  };
};

const isSurveillantGrade = (gradeLabel = "") => {
  const key = normalizeLabel(gradeLabel);
  return key.includes("surveill") || key.includes("survaill");
};

//hthii tamal ilremplaceur witchof chkon dispo,meme service,ma3andoch conge et ma3nadoch overlap
//et minba3id tamal "Remplacement de 1234567890"filbase
const resolveChefServiceReplacement = async ({
  db,
  table,
  planningCols,
  chefMatricule,
  serviceId,
  serviceName,
  startIso,
  endIso,
  chefTypeKey,
  notes,
  replacementMatricule,
}) => {
  const normalizedReplacement = String(replacementMatricule || "").replace(/\D/g, "").slice(0, 10);
  
  if (!/^\d{10}$/.test(normalizedReplacement)) {
    return { error: "Matricule du Surveillant remplaçant invalide (10 chiffres).", config: null };
  }
  if (normalizedReplacement === chefMatricule) {
    return { error: "Le remplaçant doit être différent du Chef de service.", config: null };
  }
  
  const inverseKey = chefTypeKey === "matin" ? "apres-midi" : "matin";
  const inverseRule = TYPE_RULES[inverseKey];
  if (!inverseRule) return { error: "Configuration shift invalide.", config: null };

  const resolvedInverseShift = await resolveShiftSelection({ type: SHIFT_LABELS[inverseKey] }, db);
  if (resolvedInverseShift?.error || !resolvedInverseShift?.id) {
    return { error: resolvedInverseShift?.error || "Shift remplaçant invalide.", config: null };
  }

  const repExists = await planningModel.personnelExists(normalizedReplacement, db).catch(() => false);
  if (!repExists) {
    return { error: "Surveillant remplaçant introuvable.", config: null };
  }

  const repMeta = await fetchPersonnelMeta(normalizedReplacement, db);
  if (!repMeta || !isSurveillantGrade(repMeta.grade || "")) {
    return { error: "Le remplaçant doit être un Surveillant.", config: null };
  }

  const repServiceId = Number(repMeta.serviceId);
  const hasRepServiceId = Number.isFinite(repServiceId) && repServiceId > 0;
  const plannedServiceId = Number(serviceId);
  const hasPlannedServiceId = Number.isFinite(plannedServiceId) && plannedServiceId > 0;
  if (hasRepServiceId && hasPlannedServiceId && Number(repServiceId) !== Number(plannedServiceId)) {
    return { error: "Le Surveillant remplaçant doit appartenir au même service.", config: null };
  }

  const repServiceName = (repMeta.serviceName || "").toString().trim();
  if (!hasRepServiceId && repServiceName && serviceName) {
    if (normalizeLabel(repServiceName) !== normalizeLabel(serviceName)) {
      return { error: "Le Surveillant remplaçant doit appartenir au même service.", config: null };
    }
  }

  const leaveConflict = await checkApprovedCongeOverlap(normalizedReplacement, startIso, endIso, db).catch(() => false);
  if (leaveConflict) {
    return { error: "Le Surveillant remplaçant a un congé approuvé sur cette période.", config: null };
  }

  const overlap = await hasPlanningOverlap({
    table,
    cols: planningCols,
    matricule: normalizedReplacement,
    startIso,
    endIso,
    db,
  }).catch(() => false);
  if (overlap) {
    return { error: "Le Surveillant remplaçant a déjà un emploi du temps sur cette période.", config: null };
  }

  const replacementNoteBase = `Remplacement de ${chefMatricule}`;
  const replacementNotes = notes ? `${replacementNoteBase}. ${notes}` : replacementNoteBase;
  return {
    error: "",
    config: {
      matricule: normalizedReplacement,
      startTime: inverseRule.start,
      endTime: inverseRule.end,
      type: resolvedInverseShift.label,
      typeShiftId: resolvedInverseShift.id,
      notes: replacementNotes,
    },
  };
};

const fetchPersonnelMeta = (matricule, db = pool) => planningModel.fetchPersonnelMeta(matricule, db);

const buildPersonnelName = (row) => {
  const full = `${row?.prenom || ""} ${row?.nom || ""}`.trim();
  return full || row?.matricule || "";
};
// Hathii tlawajj filbase ala Remplacement de 1234567890 o tijbid matricule
const extractReplacementOwnerMatricules = (notes = "") =>
  Array.from(
    notes
      .toString()
      .matchAll(/Remplacement\s+de\s+(\d{10})/gi),
    (match) => String(match?.[1] || "").trim()
  ).filter((value) => /^\d{10}$/.test(value));
//tjib nom et prenoom hasib matricule 
const fetchPersonnelNamesByMatricules = async (matricules = [], db = pool) => {
  const unique = Array.from(
    new Set(
      (matricules || [])
        .map((value) => (String(value || "").match(/\d/g) || []).join("").slice(0, 10))
        .filter((value) => /^\d{10}$/.test(value))
    )
  );
  if (!unique.length) return new Map();

  const { rows } = await db.query(
    `SELECT u.matricule,
            TRIM(CONCAT(COALESCE(u.prenom, ''), ' ', COALESCE(u.nom, ''))) AS full_name
     FROM utilisateur u
     WHERE u.matricule = ANY($1::varchar[])`,
    [unique]
  );

  const byMatricule = new Map();
  rows.forEach((row) => {
    const key = String(row?.matricule || "").trim();
    if (!/^\d{10}$/.test(key)) return;
    const label = String(row?.full_name || "").trim();
    byMatricule.set(key, label || key);
  });
  return byMatricule;
};
//hathii format fi notes "Remplacement de nom et prenom"
const formatReplacementOwnerNote = (notes = "", namesByMatricule = new Map()) =>
  notes
    .toString()
    .replace(/(Remplacement\s+de\s+)(\d{10})/gi, (_full, prefix, matricule) => {
      const label = namesByMatricule.get(String(matricule || "").trim());
      return `${prefix}${label || matricule}`;
    });

const isTruthy = (value) => {
  if (typeof value === "boolean") return value;
  const text = (value || "").toString().trim().toLowerCase();
  return ["1", "true", "yes", "oui", "on"].includes(text);
};
//converti date ila date UTC
const parseIsoDate = (iso) => {
  if (iso instanceof Date && !Number.isNaN(iso.getTime())) {
    return new Date(Date.UTC(iso.getUTCFullYear(), iso.getUTCMonth(), iso.getUTCDate()));
  }
  const [y, m, d] = (iso || "").split("-").map((part) => Number(part));
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const toIsoDateLike = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
};
//tihsibb kadach min jour bin deux dates 
const absDayDiff = (leftIso, rightIso) => {
  const left = parseIsoDate(leftIso);
  const right = parseIsoDate(rightIso);
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.floor((left.getTime() - right.getTime()) / MS_PER_DAY));
};

const validateNightRestRule = async ({ db, table, cols = null, matricule, requestedDates = [], typeKey }) => {
  const dates = Array.from(new Set((requestedDates || []).map(toIsoDateLike).filter(Boolean))).sort();
  if (!dates.length) return null;
  const isGarde = typeKey === "garde";

  if (isGarde) {
    for (let i = 1; i < dates.length; i += 1) {
      if (absDayDiff(dates[i], dates[i - 1]) < 3) {
        return "Ce personnel doit se reposer 2 jours entre deux shifts Garde.";
      }
    }
  }

  const shiftIsoDate = (iso, deltaDays) => {
    const parsed = parseIsoDate(iso);
    if (!parsed) return iso;
    parsed.setUTCDate(parsed.getUTCDate() + deltaDays);
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    const d = String(parsed.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const from = shiftIsoDate(dates[0], -2);
  const to = shiftIsoDate(dates[dates.length - 1], 2);
  const planningCols =
    cols && typeof cols.has === "function"
      ? cols
      : await getTableColumns(table, db).catch(() => new Set());
  const overlapClause = buildPlanningOverlapClause("p", planningCols, "$2", "$3");
  const startCols = PLANNING_START_DATE_COLS.filter((c) => planningCols.has(c));
  if (!overlapClause || !startCols.length) return null;
  const dateExpr =
    startCols.length === 1
      ? `p.${startCols[0]}`
      : `COALESCE(${startCols.map((col) => `p.${col}`).join(", ")})`;

  const typeColExpr = planningCols.has("type_shift_id") 
    ? "(SELECT type_shift FROM type_shift ts WHERE ts.id = p.type_shift_id)"
    : planningCols.has("type") ? "p.type" : "''";
  //tjib les plannig fi fatra mo3ayna 
  const { rows } = await db.query(
    `SELECT ${dateExpr} AS date, LOWER(TRIM(${typeColExpr})) AS shift_type
     FROM ${table} p
     WHERE p.matricule = $1
       AND (${overlapClause})`,
    [matricule, from, to]
  );

  const existingShifts = rows.map((r) => ({
    date: toIsoDateLike(r.date),
    isGarde: r.shift_type === "garde",
  })).filter((r) => r.date);

  for (const reqDate of dates) {
    const reqD = parseIsoDate(reqDate);
    for (const ex of existingShifts) {
      const exD = parseIsoDate(ex.date);
      const diffDays = Math.round((exD.getTime() - reqD.getTime()) / MS_PER_DAY);
      
      if (ex.isGarde && diffDays >= -2 && diffDays <= -1) {
         return "Ce personnel doit se reposer 2 jours apres un shift Garde deja planifie.";
      }
      
      if (isGarde && diffDays >= 1 && diffDays <= 2) {
         return "Ce personnel ne peut pas travailler dans les 2 jours suivant le shift Garde demande.";
      }
    }
  }
  return null;
};

const toIsoDate = (dateObj) => {
  const y = dateObj.getUTCFullYear();
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
//nistakhdmohaa bach les planning yothhroo kol nharr winharoo fil calendrier 
const buildDateRange = (fromIso, toIso) => {
  const start = parseIsoDate(fromIso);
  const end = parseIsoDate(toIso);
  if (!start || !end || start > end) return [];
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

const consultPlanning = async (req, res) => {
  try {
    const store = await ensurePlanningStore(pool);
    const serviceStore = await getServiceStore(pool);
    const planningCols = await getTableColumns(store.table, pool).catch(() => new Set());
    const planningIdCol = resolvePlanningIdColumn(planningCols);
    const matriculeFilter = (req?.query?.matricule || "").toString().trim();
    if (matriculeFilter && !/^\d{10}$/.test(matriculeFilter)) {
      return res.status(400).json({ message: "Matricule filtre invalide (10 chiffres)." });
    }

    const serviceIdCol = planningCols.has("id_service")
      ? "id_service"
      : planningCols.has("service_id")
      ? "service_id"
      : null;

    const serviceSelect =
      serviceStore && serviceIdCol ? `COALESCE(s.${serviceStore.nameCol}, '') AS service` : "'' AS service";
    const serviceJoin =
      serviceStore && serviceIdCol
        ? `LEFT JOIN ${serviceStore.table} s ON p.${serviceIdCol} = s.${serviceStore.idCol}`
        : "";

    const userCols = await getUtilisateurColumns(pool).catch(() => []);

    const rows = await planningModel.fetchPlanningRows({
      table: store.table,
      planningIdCol,
      planningCols,
      serviceStore,
      userCols,
      matriculeFilter
    }, pool);

    const replacementOwnerMatricules = rows.flatMap((row) =>
      extractReplacementOwnerMatricules(row?.notes || "")
    );
    const namesByMatricule = await fetchPersonnelNamesByMatricules(
      replacementOwnerMatricules,
      pool
    );

    const payload = rows.map((row) => ({
      id: row.id,
      matricule: row.matricule,
      id_service: row.id_service ?? null,
      type_shift_id: row.type_shift_id ?? null,
      personnel: buildPersonnelName(row),
      grade: row.grade || "",
      service: row.service || "",
      date: row.date,
      date_fin: row.date_fin || row.date,
      start_time: normalizeTime(row.start_time),
      end_time: normalizeTime(row.end_time),
      type: row.type,
      notes: formatReplacementOwnerNote(row.notes, namesByMatricule),
    }));

    return res.json(payload);
  } catch (error) {
    console.error("consultPlanning error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const parseIntSafe = (value) => {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) ? n : null;
};
//mta3 dropdown type de shift
const resolveShiftSelection = async (body, db = pool) => {
  const typeShiftIdInput =
    parseIntSafe(body?.typeShiftId ?? body?.type_shift_id ?? body?.shiftId ?? body?.type_shift_id);
  const typeInput = (body?.type || body?.type_shift || body?.shift_type || "").toString().trim();

  const shifts = await typeShiftModel.listTypeShift(db).catch(() => []);
  if (!shifts.length) return { error: "Table type_shift vide." };

  if (typeShiftIdInput) {
    const byId = shifts.find((s) => Number(s.id) === Number(typeShiftIdInput));
    if (!byId) return { error: "Shift invalide." };
    return { id: Number(byId.id), label: byId.type_shift, key: normalizeTypeKey(byId.type_shift) };
  }

  const key = normalizeTypeKey(typeInput);
  const byKey = shifts.find((s) => normalizeTypeKey(s.type_shift) === key);
  if (!byKey) return { error: "Shift invalide." };
  return { id: Number(byKey.id), label: byKey.type_shift, key };
};
//tit3mal kbal insert bach tvalider les champs 
//(malekkkkkkkk zid thabttt famashii haja fil fonction hathi bach titfasa5)
const validatePayload = async (body) => {
  const resolvedShift = await resolveShiftSelection(body || {}, pool);
  if (resolvedShift.error) {
    return { error: resolvedShift.error };
  }
  const type = resolvedShift.label;
  const typeKey = resolvedShift.key;
  const typeShiftId = resolvedShift.id;
  const replaceChefService = isTruthy(body?.replaceChefService ?? body?.replacementEnabled ?? body?.replaceChef);
  const replacementMatriculeInput = (String(
    body?.replacementMatricule ?? body?.replaceWithMatricule ?? ""
  ).match(/\d/g) || [])
    .join("")
    .slice(0, 10);
  const matricule = (String(body?.matricule || "").match(/\d/g) || []).join("").slice(0, 10);
  const replacementOfMatricule = (String(
    body?.replacementOfMatricule ?? body?.replacement_of_matricule ?? body?.replacementOf ?? body?.replacementOfUser ?? ""
  ).match(/\d/g) || [])
    .join("")
    .slice(0, 10);
  const serviceIdInput =
    body?.serviceId ?? body?.id_service ?? (typeof body?.service === "number" ? body.service : null);
  const date = (body?.date || "").toString().slice(0, 10);
  const dateEnd = (body?.dateEnd || body?.endDate || "").toString().slice(0, 10);
  let startTime = (body?.startTime || body?.start_time || "").toString().slice(0, 5);
  let endTime = (body?.endTime || body?.end_time || "").toString().slice(0, 5);
  let notes = (body?.notes || "").toString().trim();
  if (!ALLOWED_TYPE_KEYS.has(typeKey)) {
    return { error: "Type invalide." };
  }

  if (!/^\d{10}$/.test(matricule)) {
    return { error: "Matricule invalide (10 chiffres)." };
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Date invalide." };
  }
  {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const d = String(tomorrow.getDate()).padStart(2, "0");
    const minIso = `${y}-${m}-${d}`;
    if (date < minIso) {
      return { error: "La date debut doit etre a partir de demain." };
    }
  }
  const effectiveDateEnd = dateEnd || date;
  if (effectiveDateEnd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDateEnd)) {
      return { error: "Date fin invalide." };
    }
    if (effectiveDateEnd < date) {
      return { error: "Date fin doit etre apres date debut." };
    }
  }
  const rule = TYPE_RULES[typeKey];
  if (!rule) return { error: "Configuration shift invalide." };
  startTime = rule.start;
  endTime = rule.end;

  const serviceStore = await getServiceStore(pool);
  let serviceId = null;
  let resolvedServiceName = null;
  const hasServiceInput = !(serviceIdInput === null || serviceIdInput === undefined || serviceIdInput === "");
  if (serviceStore) {
    if (hasServiceInput) {
      const numeric = Number(serviceIdInput);
      if (Number.isFinite(numeric)) {
        serviceId = numeric;
      } else {
        serviceId = await resolveServiceId(serviceIdInput, pool);
      }
      if (!serviceId) {
        return { error: "Service introuvable." };
      }
      resolvedServiceName = await resolveServiceNameById(serviceId, pool);
    }
  }

  let personnelMeta = null;
  let replacementConfig = null;
  let personnelGradeKey = "";
  let isChefService = false;
  personnelMeta = await fetchPersonnelMeta(matricule, pool);

    if (replacementOfMatricule) {
      if (!/^\d{10}$/.test(replacementOfMatricule)) {
        return { error: "Matricule du personnel a remplacer invalide (10 chiffres)." };
      }
      const replacedMeta = await fetchPersonnelMeta(replacementOfMatricule, pool);
      if (replacedMeta && isGynecologueGrade(replacedMeta.grade || "")) {
        if (!personnelMeta || !isGynecologueGrade(personnelMeta.grade || "")) {
          return { error: "Un gynecologue ne peut etre remplace que par un gynecologue." };
        }
      }
    }

    const restrictions = personnelMeta ? await getRestrictionSets(pool) : null;
    personnelGradeKey = personnelMeta ? normalizeLabel(personnelMeta.grade) : "";
    isChefService = Boolean(personnelGradeKey && personnelGradeKey.includes("chef de service"));
    const isNightRestricted = Boolean(
      restrictions && personnelGradeKey && restrictions.nightRestricted.has(personnelGradeKey)
    );

    if (personnelMeta && isNightRestricted && (typeKey === "garde")) {
      return { error: "Ce personnel ne travaille pas la nuit." };
    }
    if (personnelMeta && isChefService && typeKey !== "matin" && typeKey !== "apres-midi") {
      return { error: "Un chef de service ne peut travailler que les shifts Matin ou Apres-midi." };
    }
    if (personnelMeta) {
      const personServiceId = Number(personnelMeta.serviceId);
      const hasPersonServiceId = Number.isFinite(personServiceId) && personServiceId > 0;
      const personServiceName = (personnelMeta.serviceName || "").toString().trim();

      if (hasPersonServiceId) {
        const requestedServiceId = Number(serviceId);
        if (hasServiceInput && (!Number.isFinite(requestedServiceId) || requestedServiceId !== Number(personServiceId))) {
          return { error: "Service verrouille: ce personnel doit rester dans son service." };
        }
        serviceId = Number(personServiceId);
        resolvedServiceName = (await resolveServiceNameById(serviceId, pool)) || resolvedServiceName || personServiceName;
      } else if (personServiceName) {
        if (!resolvedServiceName) {
          resolvedServiceName = personServiceName;
        } else if (hasServiceInput && normalizeLabel(personServiceName) !== normalizeLabel(resolvedServiceName)) {
          return { error: "Service verrouille: ce personnel doit rester dans son service." };
        }
      }
    }
    // planning de remplacement itsirlo la creation automatique
  return {
    matricule,
    serviceId,
    serviceName: (resolvedServiceName || body?.service || "").toString().trim(),
    date,
    dateEnd: effectiveDateEnd,
    startTime,
    endTime,
    type,
    typeShiftId,
    notes,
    typeKey,
    replacementConfig,
    replaceChefService,
    replacementMatricule: replacementMatriculeInput,
    personnelGradeKey,
    isChefService,
  };
};

const createPlanning = async (req, res) => {
  try {
    const store = await ensurePlanningStore(pool);
    const adminMatricule = await resolveAdminMatricule(req, pool);
    const payload = await validatePayload(req.body || {});
    if (payload.error) return res.status(400).json({ message: payload.error });

	    const {
	      matricule,
	      serviceId,
	      serviceName,
	      date,
	      dateEnd,
	      startTime,
	      endTime,
	      type,
	      typeShiftId,
	      notes,
	      typeKey,
	      replacementConfig: providedReplacementConfig,
	      isChefService,
	      replaceChefService,
	      replacementMatricule,
	    } = payload;

    const planningCols = await getTableColumns(store.table, pool);
    const planningIdCol = resolvePlanningIdColumn(planningCols);
    const effectiveEnd = dateEnd || date;
    let replacementConfig = providedReplacementConfig;
    //asque on activer l'option de remplacement par un survaiellant
    const shouldHandleChefReplacement = Boolean(
      !replacementConfig &&
        isChefService &&
        replaceChefService &&
        ["matin", "apres-midi"].includes(typeKey)
    );
    if (shouldHandleChefReplacement) {
      const resolved = await resolveChefServiceReplacement({
        db: pool,
        table: store.table,
        planningCols,
        chefMatricule: matricule,
        serviceId,
        serviceName,
        startIso: date,
        endIso: effectiveEnd,
        chefTypeKey: typeKey,
        notes,
        replacementMatricule,
      });
      if (resolved?.error) {
        return res.status(409).json({ message: resolved.error });
      }
      replacementConfig = resolved?.config || null;
    }

    const leaveConflict = await checkApprovedCongeOverlap(matricule, date, effectiveEnd, pool);
      if (leaveConflict) {
        return res.status(409).json({ message: "Ce personnel a un congé approuvé sur cette période." });
      }

      const overlap = await hasPlanningOverlap({
        table: store.table,
        cols: planningCols,
        matricule,
        startIso: date,
        endIso: effectiveEnd,
        db: pool,
      });
      if (overlap) {
        return res.status(409).json({ message: "Ce personnel a deja un emploi du temps sur cette periode." });
      }

    if (replacementConfig?.matricule) {
      const replacementLeaveConflict = await checkApprovedCongeOverlap(replacementConfig.matricule, date, effectiveEnd, pool);
        if (replacementLeaveConflict) {
          return res.status(409).json({ message: "Le remplaçant choisi a un congé approuvé sur cette période." });
        }

        const replacementOverlap = await hasPlanningOverlap({
          table: store.table,
          cols: planningCols,
          matricule: replacementConfig.matricule,
          startIso: date,
          endIso: effectiveEnd,
          db: pool,
        });
        if (replacementOverlap) {
          return res.status(409).json({
            message: "Le remplacant choisi a deja un emploi du temps sur cette periode.",
          });
        }
      }

    const requestedDates = buildDateRange(date, dateEnd || date);
      const nightRestError = await validateNightRestRule({
        db: pool,
        table: store.table,
        cols: planningCols,
        matricule,
        requestedDates,
        typeKey,
      });
    if (nightRestError) {
      return res.status(400).json({ message: nightRestError });
    }

    let mainIds = [];
    let replacementIds = [];
    const txClient = replacementConfig ? await pool.connect() : null;
    const db = txClient || pool;
    try {
      if (txClient) await txClient.query("BEGIN");

	    const insertMain = buildPlanningInsertQuery({
	      table: store.table,
	      cols: planningCols,
	      idCol: planningIdCol,
	      matricule,
	      adminMatricule,
	      serviceId,
	      serviceName,
	      dateStart: date,
	      dateEnd,
	      startTime,
	      endTime,
	      type, 
	      typeShiftId,
	      notes,
	    });
      if (insertMain.error || !insertMain.text) {
        if (txClient) await txClient.query("ROLLBACK");
        return res.status(500).json({ message: insertMain.error || "Erreur serveur." });
      }
      { //insertion normall
        const rows = await planningModel.insertPlanningRow(insertMain.text, insertMain.values, db);
        mainIds = rows.map((row) => row.id).filter(Boolean);
      }

      if (replacementConfig) {
        const replacementNoteBase = `Remplacement de ${matricule}`;
        const replacementNotes =
          (replacementConfig.notes || "").toString().trim() ||
          (notes ? `${replacementNoteBase}. ${notes}` : replacementNoteBase);

        let replacementTypeShiftId = replacementConfig.typeShiftId ?? null;
        if (!replacementTypeShiftId && replacementConfig.type) {
          const resolvedReplacementShift = await resolveShiftSelection({ type: replacementConfig.type }, db);
          replacementTypeShiftId = resolvedReplacementShift?.id ?? null;
        }

        const insertReplacement = buildPlanningInsertQuery({
          table: store.table,
          cols: planningCols,
          idCol: planningIdCol,
          matricule: replacementConfig.matricule,
          adminMatricule,
          serviceId,
          serviceName,
          dateStart: date,
          dateEnd,
          startTime: replacementConfig.startTime,
          endTime: replacementConfig.endTime,
          type: replacementConfig.type,
          typeShiftId: replacementTypeShiftId,
          notes: replacementNotes,
        });
        if (insertReplacement.error || !insertReplacement.text) {
          if (txClient) await txClient.query("ROLLBACK");
          return res.status(500).json({ message: insertReplacement.error || "Erreur serveur." });
        }
        //insertion du remplacement
        const rows = await planningModel.insertPlanningRow(insertReplacement.text, insertReplacement.values, db);
        replacementIds = rows.map((row) => row.id).filter(Boolean);
      }

      if (txClient) await txClient.query("COMMIT");
    } catch (error) {
      if (txClient) await txClient.query("ROLLBACK");
      throw error;
    } finally {
      if (txClient) txClient.release();
    }

    if (replacementConfig) {
      return res.status(201).json({
        message: `Planning Chef cree + remplacement Surveillant en ${replacementConfig.type}.`,
        ids: [...mainIds, ...replacementIds],
        chef_ids: mainIds,
        remplacement_ids: replacementIds,
        id: mainIds[0] || null,
      });
    }

    const insertForRange = Boolean(dateEnd && dateEnd !== date);
    if (insertForRange) {
      return res.status(201).json({
        message: "Planning ajoute.",
        ids: mainIds,
      });
    }
    return res.status(201).json({ message: "Planning ajoute.", id: mainIds[0] || null });
  } catch (error) {
    console.error("createPlanning error:", error);
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Conflit: un planning existe deja pour cette periode." });
    }
    if (error?.code === "23502") {
      const col = (error?.column || "").toString().trim();
      return res.status(400).json({
        message: col
          ? `Champ obligatoire manquant (colonne: ${col}).`
          : "Champ obligatoire manquant.",
      });
    }
    if (error?.code === "23503") {
      return res.status(400).json({ message: "Donnees liees invalides (service/personnel)." });
    }
    if (error?.code === "22P02") {
      return res.status(400).json({ message: "Valeur invalide envoyee." });
    }
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const deletePlanning = async (req, res) => {
  const id = Number.parseInt(req.params?.id || "", 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "ID planning invalide." });
  }
  try {
    const store = await ensurePlanningStore(pool);
    const planningCols = await getTableColumns(store.table, pool).catch(() => new Set());
    const planningIdCol = resolvePlanningIdColumn(planningCols);
    const existing = await planningModel.fetchPlanningById(store.table, planningIdCol, id, pool);
    if (!existing.found) {
      return res.status(404).json({ message: "Planning introuvable." });
    }

    try {
      const requestsStore = await getPlanningRequestStore(pool).catch(() => null);
      if (requestsStore?.table) {
        await planningModel.deletePlanningRequests(requestsStore.table, id, pool);
      }
    } catch (error) {
      console.warn("deletePlanning: planning_requests cleanup skipped:", error?.message || error);
    }

    await planningModel.deletePlanningById(store.table, planningIdCol, id, pool);
    return res.json({ message: "Planning supprime." });
  } catch (error) {
    console.error("deletePlanning error:", error);
    if (error?.code === "23503") {
      return res.status(409).json({
        message: "Suppression impossible: ce planning est lie a une demande de modification.",
      });
    }
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

module.exports = {
  consultPlanning,
  createPlanning,
  deletePlanning,
  listTypeShift,
};