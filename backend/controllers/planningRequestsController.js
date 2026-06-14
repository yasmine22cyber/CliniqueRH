const pool = require("../config/db");
const jwt = require("jsonwebtoken");
const requestsModel = require("../models/planningRequestsModel");
const {
  ensurePlanningStore,
  personnelExists,
  fetchPersonnelMeta,
} = require("../models/planningModel");
const { getUtilisateurColumns, getTableColumns } = require("../models/dbUtils");
const { getGradeStore } = require("../models/gradeModel");
const { getServiceStore, resolveServiceId, resolveServiceNameById } = require("../models/serviceModel");
const { ensureCongeStore, checkApprovedCongeOverlap } = require("../models/congesModel");
const typeShiftModel = require("../models/typeShiftModel");
const { findAdminMatricule } = require("../models/utilisateurModel");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

const STATUS_VALUES = Object.freeze({
  pending: "En attente",
  approved: "Approuver",
  refused: "Refuser",
  canceled: "Annuler",
});

const PLANNING_ID_COLS = requestsModel.PLANNING_ID_COLS;
const REQUEST_ID_COLS = requestsModel.REQUEST_ID_COLS;
const REQUEST_PLANNING_FK_COLS = requestsModel.REQUEST_PLANNING_FK_COLS;
const SHIFT_RULES = Object.freeze({
  Matin: { start: "07:00", end: "14:00" },
  "Apres-midi": { start: "14:00", end: "19:00" },
  Garde: { start: "19:00", end: "07:00" },
});

const resolveColumn = (cols = new Set(), candidates = []) => candidates.find((col) => cols.has(col)) || null;

const normalizeShiftTypeKey = (value = "") => {
  const raw = (value || "").toString().trim();
  if (!raw) return "";
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.includes("matin")) return "matin";
  if (normalized.includes("apres")) return "apres-midi";
  if (normalized.includes("garde")) return "garde";
  return normalized;
};

const resolveTypeShiftId = async (shiftLabel, db = pool) => {
  const key = normalizeShiftTypeKey(shiftLabel);
  if (!key) return null;
  const rows = await typeShiftModel.listTypeShift(db).catch(() => []);
  const found = rows.find((r) => normalizeShiftTypeKey(r.type_shift) === key);
  const id = Number(found?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
};
//tchof colone fidb oblige tkon not null ou non
const isNonNullableColumn = async (tableName, columnName, db = pool) => {
  if (!tableName || !columnName) return false;
  const { rows } = await db.query(
    `SELECT is_nullable
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name=$2
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length ? String(rows[0].is_nullable || "").toUpperCase() === "NO" : false;
};

const extractBearerToken = (req) => {
  const header = req.get?.("authorization") || req.headers?.authorization || "";
  const raw = Array.isArray(header) ? header[0] : String(header || "");
  const match = raw.match(/^\s*Bearer\s+(.+)\s*$/i);
  return match ? match[1] : "";
};

const extractJwtMatricule = (req) => {
  const token = extractBearerToken(req);
  if (!token) return "";
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return normalizeMatricule(payload?.matricule || "");
  } catch {
    return "";
  }
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

const isAdminRole = (value = "") =>
  value
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

  const fromBody = normalizeMatricule(
    req.body?.matriculeAdmin ?? req.body?.matricule_admin ?? req.body?.adminMatricule ?? ""
  );
  if (fromBody) {
    const { rows } = await db.query(
      "SELECT 1 FROM utilisateur WHERE matricule = $1 AND LOWER(COALESCE(role, '')) LIKE '%admin%' LIMIT 1",
      [fromBody]
    ).catch(() => ({ rows: [] }));
    if (rows.length) return fromBody;
  }
  return (await findAdminMatricule(db)) || null;
};
//tjib matricule de personnel amall request
const resolveCallerMatricule = (req) => {
  const fromJwt = extractJwtMatricule(req);
  if (fromJwt) return fromJwt;
  const fromBody = normalizeMatricule(req.body?.matricule || "");
  if (fromBody) return fromBody;
  return normalizeMatricule(req.query?.matricule || "");//o tjibo min url de api (?matricule=5220200222)
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

const normalizeShift = (value) => {
  const raw = (value || "").toString().trim();
  if (!raw) return null;
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("matin")) return "Matin";
  if (normalized.includes("apres")) return "Apres-midi";
  if (normalized.includes("garde")) return "Garde";
  return null;
};
//asque ilvalue est une date valide ou non
const isValidDate = (value) => {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
};

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const sanitizeRow = (row = {}) => ({
  ...row,
  statut: normalizeStatus(row.statut) || row.statut || STATUS_VALUES.pending,
  replacement_matricule: row.replacement_matricule || row.replacementMatricule || null,
});


const getPlanningContext = async () => {
  const store = await ensurePlanningStore(pool).catch(() => null);
  if (!store) return null;
  const cols = await getTableColumns(store.table);
  const idCol = resolveColumn(cols, PLANNING_ID_COLS);
  if (!idCol) return null;
  return { table: store.table, idCol };
};

const getPlanningRequestContext = async () => {
  const table = "planning_requests";
  const cols = await getTableColumns(table);
  if (!cols.size) return null;
  const idCol = resolveColumn(cols, REQUEST_ID_COLS);
  const planningFkCol = resolveColumn(cols, REQUEST_PLANNING_FK_COLS);
  if (!idCol || !planningFkCol) return null;
  return { table, idCol, planningFkCol };
};


const normalizeMatricule = (value = "") => String(value || "").replace(/\D/g, "").slice(0, 10);

const toIsoDateOnly = (value) => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
};

const addDaysToIso = (isoDate, days) => {
  const value = toIsoDateOnly(isoDate);
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

//tlawaj ala planning hasib date et matricule
const findPlanningRowForDate = async ({ table, idCol, matricule, isoDate }) => {
  const cols = await getTableColumns(table);
  const clause = requestsModel.buildPlanningDateMatchClause("p", cols, "$2");
  if (!clause) return null;
  
  return requestsModel.fetchPlanningRowForDate({ table, idCol, matricule, clause, isoDate }, pool);
};
//tlawaj ala planning hasib date et idplanning
const findPlanningRowByIdForDate = async ({ table, idCol, planningId, isoDate }) => {
  const cols = await getTableColumns(table);
  const clause = requestsModel.buildPlanningDateMatchClause("p", cols, "$2");
  if (!clause) return null;
  return requestsModel.fetchPlanningRowByIdForDate({ table, idCol, planningId, clause, isoDate }, pool);
};
//trod planningrequest refuse kan date mta3ha ifaa
const expirePendingPlanningRequests = async () => {
  const store = await getPlanningRequestContext();
  if (!store) return;
  const isoToday = todayISO();
  await requestsModel.expirePendingRequests(store.table, STATUS_VALUES.refused, isoToday, pool);
};
//nchofo itha nafs personnel m3adii akthar minrequest finafis nhar manha  conflit
const findPlanningRequestConflict = async ({
  requests,
  planning,
  matricule,
  isoDate,
  excludeRequestId = null,
}) => {
  if (!requests || !planning || !matricule || !isoDate) return null;
  return requestsModel.fetchPlanningRequestConflict({
    requestsTable: requests.table,
    requestsIdCol: requests.idCol,
    requestsFkCol: requests.planningFkCol,
    planningTable: planning.table,
    planningIdCol: planning.idCol,
    matricule,
    isoDate,
    excludeRequestId,
  }, pool);
};

const listPlanningRequests = async (req, res) => {
  try {
    await requestsModel.ensurePlanningRequestStore(pool);
    await expirePendingPlanningRequests();

    const requests = await getPlanningRequestContext();
    if (!requests) return res.status(500).json({ message: "Table planning_requests introuvable." });

    const planning = await getPlanningContext();
    if (!planning) return res.status(400).json({ message: "Aucun planning disponible." });

    const planningId = Number.parseInt(req.query.planning_id, 10);
    const matricule = (req.query.matricule || "").toString().trim();
    const includeReplacements = ["1", "true", "yes", "on"].includes(
      (req.query.include_replacements || "").toString().trim().toLowerCase()
    );
    const params = [];
    const where = [];

    if (Number.isFinite(planningId)) {
      params.push(planningId);
      where.push(`r.${requests.planningFkCol} = $${params.length}`);
    }

    if (matricule) {
      params.push(matricule);
      if (includeReplacements) {
        where.push(`(p.matricule = $${params.length} OR r.replacement_matricule = $${params.length})`);
      } else {
        where.push(`p.matricule = $${params.length}`);
      }
    }

    const rows = await requestsModel.fetchPlanningRequestsList({ requests, planning, where, params }, pool);
    return res.json(rows.map(sanitizeRow));
  } catch (error) {
    console.error("listPlanningRequests error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const listPlanningRequestsAdmin = async (_req, res) => {
  try {
    await requestsModel.ensurePlanningRequestStore(pool);
    await expirePendingPlanningRequests();

    const requests = await getPlanningRequestContext();
    if (!requests) return res.status(500).json({ message: "Table planning_requests introuvable." });

    const planning = await getPlanningContext();
    if (!planning) return res.status(400).json({ message: "Aucun planning disponible." });

    const userCols = await getUtilisateurColumns(pool).catch(() => []);
    const hasPrenom = userCols.includes("prenom");
    const hasNom = userCols.includes("nom");
    const hasService = userCols.includes("service");
    const hasIdService = userCols.includes("id_service");
    const hasGradeCol = userCols.includes("grade");
    const hasIdGrade = userCols.includes("id_grade");

    const planningCols = await getTableColumns(planning.table).catch(() => new Set());
    const planningServiceIdCol = planningCols.has("id_service")
      ? "id_service"
      : planningCols.has("service_id")
      ? "service_id"
      : null;

    let serviceSelect = hasService ? "COALESCE(u.service, '') AS service" : "'' AS service";
    let idServiceSelect = hasIdService
      ? "COALESCE(u.id_service::text, '') AS id_service"
      : "'' AS id_service";
    let serviceJoin = "";

    if (planningServiceIdCol) {
      idServiceSelect = `COALESCE(p.${planningServiceIdCol}::text, '') AS id_service`;
      const serviceStore = await getServiceStore(pool).catch(() => null);
      if (serviceStore) {
        serviceSelect = `COALESCE(s.${serviceStore.nameCol}, '') AS service`;
        serviceJoin = `LEFT JOIN ${serviceStore.table} s ON p.${planningServiceIdCol} = s.${serviceStore.idCol}`;
      }
    }

    let gradeSelect = "'' AS grade";
    let gradeJoin = "";
    if (hasGradeCol) {
      gradeSelect = "COALESCE(u.grade, '') AS grade";
    } else if (hasIdGrade) {
      const store = await getGradeStore(pool).catch(() => null);
      if (store) {
        gradeSelect = `COALESCE(g.${store.labelCol}, '') AS grade`;
        gradeJoin = `LEFT JOIN ${store.table} g ON g.${store.idCol} = u.id_grade`;
      }
    }

    const select = [
      `r.${requests.idCol} AS id`,
      `r.${requests.planningFkCol} AS planning_id`,
      "p.matricule",
      "r.date_preferee",
      "r.shift_type",
      "r.raison",
      "r.replacement_matricule",
      "r.statut",
      "r.created_at",
      "r.updated_at",
      hasPrenom ? "COALESCE(u.prenom, '') AS prenom" : "'' AS prenom",
      hasNom ? "COALESCE(u.nom, '') AS nom" : "'' AS nom",
      serviceSelect,
      idServiceSelect,
      gradeSelect,
    ];
    //hthi ilitamal affichage mta3 les demandes m3a les infos mta3 personnel w service w grade
    const rows = await requestsModel.fetchPlanningRequestsAdminList({ 
      requests, 
      planning, 
      selectJoinStr: select.join(", "),
      joinsStr: [serviceJoin, gradeJoin].filter(Boolean).join("\n")
    }, pool);
    //hata hthi
    return res.json(rows.map(sanitizeRow));
  } catch (error) {
    console.error("listPlanningRequestsAdmin error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const createPlanningRequest = async (req, res) => {
  try {
    await requestsModel.ensurePlanningRequestStore(pool);

    const requests = await getPlanningRequestContext();
    if (!requests) return res.status(500).json({ message: "Table planning_requests introuvable." });

    const { planning_id, date_preferee, shift_type, raison } = req.body ?? {};
    const matricule = resolveCallerMatricule(req);

    const planning = await getPlanningContext();
    if (!planning) return res.status(400).json({ message: "Aucun planning disponible." });

    if (!isValidDate(date_preferee)) {
      return res.status(400).json({ message: "Date preferee invalide." });
    }
    const desiredIso = new Date(date_preferee).toISOString().slice(0, 10);
    if (desiredIso < todayISO()) {
      return res.status(400).json({ message: "La date preferee ne peut pas etre dans le passe." });
    }

    let planningRow = null;
    const planningId = Number.parseInt(planning_id, 10);
    if (Number.isFinite(planningId)) {
      planningRow = await findPlanningRowByIdForDate({
        table: planning.table,
        idCol: planning.idCol,
        planningId,
        isoDate: desiredIso,
      });
      if (!planningRow) {
        return res.status(400).json({ message: "Planning introuvable pour cette date." });
      }
    } else {
      if (!/^\d{10}$/.test(matricule)) {
        return res.status(400).json({ message: "Matricule requis (10 chiffres) ou planning_id requis." });
      }
      planningRow = await findPlanningRowForDate({
        table: planning.table,
        idCol: planning.idCol,
        matricule,
        isoDate: desiredIso,
      });
      if (!planningRow) {
        return res.status(400).json({
          message: "Aucun emploi du temps pour cette date. Demande de modification impossible.",
        });
      }
    }

    const ownerMatricule = String(planningRow?.matricule || "").trim();
    if (matricule && ownerMatricule && matricule !== ownerMatricule) {
      return res.status(403).json({ message: "Vous ne pouvez pas envoyer une demande pour un autre personnel." });
    }

    const normalizedShift = normalizeShift(shift_type);
    if (!normalizedShift) {
      return res.status(400).json({ message: "Shift invalide (Matin, Apres-midi, Garde)." });
    }
    const safeReason = (raison || "").toString().trim();
    if (!safeReason) {
      return res.status(400).json({ message: "Raison requise." });
    }

    const conflict = await findPlanningRequestConflict({
      requests,
      planning,
      matricule: ownerMatricule,
      isoDate: desiredIso,
    });
    if (conflict) {
      return res.status(409).json({
        message: "Une demande existe deja pour cette date. Modifiez-la depuis l'historique.",
      });
    }

    const row = await requestsModel.insertPlanningRequest({
      requests,
      planningId: planningRow.id,
      desiredIso,
      normalizedShift,
      safeReason,
      pendingStatus: STATUS_VALUES.pending
    }, pool);

    return res.status(201).json(sanitizeRow({ ...row, matricule: ownerMatricule || null }));
  } catch (error) {
    console.error("createPlanningRequest error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const updatePlanningRequest = async (req, res) => {
  try {
    await requestsModel.ensurePlanningRequestStore(pool);
    await expirePendingPlanningRequests();

    const requests = await getPlanningRequestContext();
    if (!requests) return res.status(500).json({ message: "Table planning_requests introuvable." });

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "ID demande invalide." });
    }
    const { date_preferee, shift_type, raison, statut } = req.body ?? {};

    const planning = await getPlanningContext();
    if (!planning) return res.status(400).json({ message: "Aucun planning disponible." });

    const existingRows = await requestsModel.fetchPlanningRequestById({ requests, planning, id }, pool);
    if (!existingRows.length) {
      return res.status(404).json({ message: "Demande introuvable." });
    }

    const callerMatricule = resolveCallerMatricule(req);
    const ownerMatricule = (existingRows[0]?.matricule || "").toString().trim();
    if (callerMatricule && ownerMatricule && callerMatricule !== ownerMatricule) {
      return res.status(403).json({ message: "Vous ne pouvez pas modifier la demande d'un autre personnel." });
    }

    const currentStatus = normalizeStatus(existingRows[0].statut) || STATUS_VALUES.pending;
    if (currentStatus !== STATUS_VALUES.pending) {
      return res.status(400).json({ message: "Seules les demandes en attente peuvent etre modifiees." });
    }

    const desiredStatus = normalizeStatus(statut);
    if (desiredStatus === STATUS_VALUES.canceled) {
      const row = await requestsModel.updatePlanningRequestStatus({ requests, status: STATUS_VALUES.canceled, id }, pool);
      return res.json(sanitizeRow(row || {}));
    }

    if (!isValidDate(date_preferee)) {
      return res.status(400).json({ message: "Date preferee invalide." });
    }
    const desiredIso = new Date(date_preferee).toISOString().slice(0, 10);
    if (desiredIso < todayISO()) {
      return res.status(400).json({ message: "La date preferee ne peut pas etre dans le passe." });
    }

    if (!/^\d{10}$/.test(ownerMatricule)) {
      return res.status(400).json({ message: "Matricule invalide (10 chiffres)." });
    }
    const planningRow = await findPlanningRowForDate({
      table: planning.table,
      idCol: planning.idCol,
      matricule: ownerMatricule,
      isoDate: desiredIso,
    });
    if (!planningRow) {
      return res.status(400).json({ message: "Aucun emploi du temps pour cette date. Modification impossible." });
    }

    const normalizedShift = normalizeShift(shift_type);
    if (!normalizedShift) {
      return res.status(400).json({ message: "Shift invalide (Matin, Apres-midi, Garde)." });
    }
    const safeReason = (raison || "").toString().trim();
    if (!safeReason) {
      return res.status(400).json({ message: "Raison requise." });
    }

    const conflict = await findPlanningRequestConflict({
      requests,
      planning,
      matricule: ownerMatricule,
      isoDate: desiredIso,
      excludeRequestId: id,
    });
    if (conflict) {
      return res.status(409).json({
        message: "Une demande existe deja pour cette date. Modifiez-la depuis l'historique.",
      });
    }

    const row = await requestsModel.updatePlanningRequest({
      requests,
      planningId: planningRow.id,
      desiredIso,
      normalizedShift,
      safeReason,
      id
    }, pool);

    return res.json(sanitizeRow(row || {}));
  } catch (error) {
    console.error("updatePlanningRequest error:", error);
    return res.status(500).json({ message: "Erreur serveur.", error: String(error.stack || error) });
  }
};

const updatePlanningRequestStatus = async (req, res) => {
  try {
    await requestsModel.ensurePlanningRequestStore(pool);
    await expirePendingPlanningRequests();
    await ensureCongeStore(pool).catch(() => null);

    const requests = await getPlanningRequestContext();
    if (!requests) return res.status(500).json({ message: "Table planning_requests introuvable." });
    const planning = await getPlanningContext();
    if (!planning) return res.status(400).json({ message: "Aucun planning disponible." });
    const planningCols = await getTableColumns(planning.table);

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "ID demande invalide." });
    }

    const { statut, replacement_matricule, replacementMatricule } = req.body ?? {};
    const nextStatus = normalizeStatus(statut);
    if (![STATUS_VALUES.approved, STATUS_VALUES.refused].includes(nextStatus)) {
      return res.status(400).json({ message: "Statut invalide (Approuve ou Refuse)." });
    }
    const replacementRaw = (replacement_matricule ?? replacementMatricule ?? "").toString().trim();
    const replacementMatriculeValue = normalizeMatricule(replacementRaw);
    const hasReplacementCandidate = /^\d{10}$/.test(replacementMatriculeValue);
    if (replacementRaw && !hasReplacementCandidate) {
      return res.status(400).json({
        message: "Matricule remplacant invalide (10 chiffres).",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existingRows = await requestsModel.fetchPlanningRequestForUpdate({ requests, planning, id }, client);
      if (!existingRows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Demande introuvable." });
      }

      const requestRow = existingRows[0];
      const currentStatus = normalizeStatus(requestRow.statut) || STATUS_VALUES.pending;
      if (currentStatus !== STATUS_VALUES.pending) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Seules les demandes en attente peuvent etre modifiees." });
      }

      if (nextStatus === STATUS_VALUES.refused) {
        const row = await requestsModel.updatePlanningRequestRefused({ requests, refusedStatus: nextStatus, id }, client);
        await client.query("COMMIT");
        return res.json(sanitizeRow(row || {}));
      }

      const adminMatricule = await resolveAdminMatricule(req, client);

      const desiredIso = toIsoDateOnly(requestRow.date_preferee);
      if (!desiredIso || desiredIso < todayISO()) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Date preferee invalide pour approbation." });
      }

      const desiredShift = normalizeShift(requestRow.shift_type);
      if (!desiredShift || !SHIFT_RULES[desiredShift]) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Shift demande invalide (Matin, Apres-midi, Garde)." });
      }

      const ownerMatricule = (requestRow.matricule || "").toString().trim();
      const planningEntry = await requestsModel.fetchPlanningEntryForDateForUpdate({
        planning,
        planningCols,
        planningId: requestRow.planning_id,
        fallbackMatricule: ownerMatricule,
        isoDate: desiredIso,
      }, client);
      if (!planningEntry) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Aucun planning trouve pour cette date. Approbation impossible." });
      }

      const currentShift = normalizeShift(planningEntry.type);
      if (!currentShift || !SHIFT_RULES[currentShift]) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Shift actuel introuvable. Contactez un administrateur." });
      }

      const shiftChanged = currentShift !== desiredShift;
      if (shiftChanged) {
        if (hasReplacementCandidate) {
          if (replacementMatriculeValue === ownerMatricule) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Le remplacant doit etre different du demandeur." });
          }

          const repExists = await personnelExists(replacementMatriculeValue, client);
          if (!repExists) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Remplacant introuvable." });
          }

          const ownerMeta = await fetchPersonnelMeta(ownerMatricule, client);
          const repMeta = await fetchPersonnelMeta(replacementMatriculeValue, client);
          const ownerGrade = ownerMeta?.grade ? ownerMeta.grade.toLowerCase().trim() : "";
          const repGrade = repMeta?.grade ? repMeta.grade.toLowerCase().trim() : "";

          if (ownerGrade.includes("chef de service")) {
            if (!repGrade.includes("surveillant")) {
              await client.query("ROLLBACK");
              return res.status(400).json({ message: "Un chef de service ne peut être remplacé que par un surveillant." });
            }
          } else if (ownerGrade !== repGrade) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: `Le remplaçant doit avoir le même grade que le demandeur (${ownerMeta?.grade || 'Inconnu'}).` });
          }

          const shiftIdCol = planningCols.has("type_shift_id")
            ? "type_shift_id"
            : planningCols.has("shift_id")
            ? "shift_id"
            : null;
          if (shiftIdCol) {
            const nonNullable = await isNonNullableColumn(planning.table, shiftIdCol, client).catch(() => false);
            if (nonNullable) {
              const candidateOldShiftId =
                Number.isFinite(Number(planningEntry.type_shift_id)) && Number(planningEntry.type_shift_id) > 0
                  ? Number(planningEntry.type_shift_id)
                  : await resolveTypeShiftId(currentShift, client);
              if (!candidateOldShiftId) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                  message: "Type shift introuvable (Matin/Apres-midi/Garde). Vérifiez la table type_shift.",
                });
              }
            }
          }
 
          const hasApprovedLeave = await checkApprovedCongeOverlap(
            replacementMatriculeValue,
            desiredIso,
            desiredIso,
            client
          ).catch(() => false);
          if (hasApprovedLeave) {
            await client.query("ROLLBACK");
            return res.status(409).json({
              message: "Aucun remplacant disponible: ce remplacant est en congé approuvé sur cette date.",
            });
          }

          const overlapClause = requestsModel.buildPlanningDateMatchClause("p", planningCols, "$2");
          if (overlapClause) {
            const { rows: repOverlapRows } = await client.query(
              `SELECT 1 FROM ${planning.table} p WHERE p.matricule = $1 AND (${overlapClause}) LIMIT 1`,
              [replacementMatriculeValue, desiredIso]
            );
            if (repOverlapRows.length > 0) {
              await client.query("ROLLBACK");
              return res.status(409).json({
                message: "Aucun remplacant disponible: ce remplacant a deja un shift sur cette date.",
              });
            }
          }
        }
      }

      const rowStart = toIsoDateOnly(planningEntry.date_start);
      const rowEnd = toIsoDateOnly(planningEntry.date_end || planningEntry.date_start);
      const oldType = (planningEntry.type || currentShift).toString().trim();
      const oldTypeShiftId =
        Number.isFinite(Number(planningEntry.type_shift_id)) && Number(planningEntry.type_shift_id) > 0
          ? Number(planningEntry.type_shift_id)
          : await resolveTypeShiftId(oldType, client);
      const oldStartTime = (planningEntry.start_time || SHIFT_RULES[currentShift].start).toString().slice(0, 5);
      const oldEndTime = (planningEntry.end_time || SHIFT_RULES[currentShift].end).toString().slice(0, 5);
      const oldNotes = (planningEntry.notes || "").toString().trim() || null;
      const serviceRaw = Number(planningEntry.id_service);
      let serviceId = Number.isFinite(serviceRaw) ? serviceRaw : null;
      let serviceName = (planningEntry.service_name || "").toString().trim() || null;
      if (!serviceId && serviceName) {
        serviceId = await resolveServiceId(serviceName, client).catch(() => null);
      }
      if (!serviceName && serviceId) {
        serviceName = await resolveServiceNameById(serviceId, client).catch(() => null);
      }

      const serviceIdCol = planningCols.has("id_service") ? "id_service" : planningCols.has("service_id") ? "service_id" : null;
      if (serviceIdCol) {
        const nonNullable = await isNonNullableColumn(planning.table, serviceIdCol, client).catch(() => false);
        if (nonNullable && !serviceId) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "Service introuvable pour ce planning. Approbation impossible." });
        }
      }
      const serviceNameCol = planningCols.has("service") ? "service" : planningCols.has("service_planning") ? "service_planning" : null;
      if (serviceNameCol) {
        const nonNullable = await isNonNullableColumn(planning.table, serviceNameCol, client).catch(() => false);
        if (nonNullable && !serviceName) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "Nom de service introuvable pour ce planning. Approbation impossible." });
        }
      }

      const desiredTypeShiftId = await resolveTypeShiftId(desiredShift, client);
      {
        const shiftIdCol = planningCols.has("type_shift_id")
          ? "type_shift_id"
          : planningCols.has("shift_id")
          ? "shift_id"
          : null;
        if (shiftIdCol) {
          const nonNullable = await isNonNullableColumn(planning.table, shiftIdCol, client).catch(() => false);
          if (nonNullable && !desiredTypeShiftId) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              message: "Type shift introuvable (Matin/Apres-midi/Garde). Vérifiez la table type_shift.",
            });
          }
        }
      }

      if (rowStart && rowStart < desiredIso) {
        const beforeEnd = addDaysToIso(desiredIso, -1);
        if (beforeEnd) {
          await requestsModel.insertPlanningRowModel({
            table: planning.table,
            idCol: planning.idCol,
            cols: planningCols,
            matricule: planningEntry.matricule,
            adminMatricule,
            serviceId,
            serviceName,
            dateStart: rowStart,
            dateEnd: beforeEnd,
            startTime: oldStartTime,
            endTime: oldEndTime,
            type: oldType,
            typeShiftId: oldTypeShiftId,
            notes: oldNotes,
            db: client,
          });
        }
      }

      if (rowEnd && rowEnd > desiredIso) {
        const afterStart = addDaysToIso(desiredIso, 1);
        if (afterStart) {
          await requestsModel.insertPlanningRowModel({
            table: planning.table,
            idCol: planning.idCol,
            cols: planningCols,
            matricule: planningEntry.matricule,
            adminMatricule,
            serviceId,
            serviceName,
            dateStart: afterStart,
            dateEnd: rowEnd,
            startTime: oldStartTime,
            endTime: oldEndTime,
            type: oldType,
            typeShiftId: oldTypeShiftId,
            notes: oldNotes,
            db: client,
          });
        }
      }

      const nextRule = SHIFT_RULES[desiredShift];
      await requestsModel.buildPlanningSetQueryModel({
        table: planning.table,
        idCol: planning.idCol,
        cols: planningCols,
        id: planningEntry.id,
        adminMatricule,
        dateStart: desiredIso,
        dateEnd: desiredIso,
        startTime: nextRule.start,
        endTime: nextRule.end,
        type: desiredShift,
        typeShiftId: desiredTypeShiftId,
        notes: oldNotes,
        db: client,
      });

      let replacementPlanningId = null;
      if (shiftChanged && hasReplacementCandidate) {
        const { rows: ownerRows } = await client.query(
          "SELECT nom, prenom FROM utilisateur WHERE matricule = $1 LIMIT 1",
          [ownerMatricule]
        );
        const ownerName = ownerRows.length ? `${ownerRows[0].prenom || ""} ${ownerRows[0].nom || ""}`.trim() || ownerMatricule : ownerMatricule;
        const replacementNote = `Remplacement demande ${ownerName}`;
        replacementPlanningId = await requestsModel.insertPlanningRowModel({
          table: planning.table,
          idCol: planning.idCol,
          cols: planningCols,
          matricule: replacementMatriculeValue,
          adminMatricule,
          serviceId,
          serviceName,
          dateStart: desiredIso,
          dateEnd: desiredIso,
          startTime: oldStartTime,
          endTime: oldEndTime,
          type: oldType,
          typeShiftId: oldTypeShiftId,
          notes: replacementNote,
          db: client,
        });
      }

      const row = await requestsModel.updatePlanningRequestApproved({
        requests,
        approvedStatus: nextStatus,
        replacementMatricule: shiftChanged && hasReplacementCandidate ? replacementMatriculeValue : null,
        id
      }, client);

      await client.query("COMMIT");
      return res.json(sanitizeRow({ ...(row || {}), replacement_planning_id: replacementPlanningId }));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("updatePlanningRequestStatus error:", error);
    const pgCode = String(error?.code || "");
    const column = error?.column ? String(error.column) : "";
    const table = error?.table ? String(error.table) : "";
    const constraint = error?.constraint ? String(error.constraint) : "";
    let message =
      pgCode === "23502"
        ? `Configuration planning invalide: champ requis manquant${column ? ` (${column})` : ""}.`
        : pgCode === "23503"
        ? `Configuration planning invalide: contrainte de référence${constraint ? ` (${constraint})` : ""}.`
        : "Erreur serveur.";

    if (message === "Erreur serveur.") {
      if (pgCode === "23505") {
        message = "Conflit: une donnee existe deja (doublon).";
      } else if (pgCode === "22P02") {
        message = "Donnee invalide: format incorrect.";
      } else if (pgCode === "22001") {
        message = "Donnee invalide: texte trop long.";
      } else {
        const detail = error?.detail ? String(error.detail) : "";
        const errMsg = error?.message ? String(error.message) : "";
        const debug = errMsg || detail;
        if (debug) message = `Erreur serveur: ${debug}`;
      }
    }
    return res.status(500).json({
      message,
      error: String(error.stack || error),
      meta: { pgCode, table, column, constraint },
    });
  }
};

module.exports = {
  listPlanningRequests,
  listPlanningRequestsAdmin,
  createPlanningRequest,
  updatePlanningRequest,
  updatePlanningRequestStatus,
};