const pool = require("../config/db");

const PLANNING_ID_COLS = ["id", "id_planning"];
const REQUEST_ID_COLS = ["id", "id_planning_requests", "id_planning_request", "id_demande_planning"];
const REQUEST_PLANNING_FK_COLS = ["planning_id", "id_planning"];
const PLANNING_START_DATE_COLS = ["date", "date_debut", "date_debut_planning"];
const PLANNING_END_DATE_COLS = ["date_fin", "date_fin_planning"];
const PLANNING_START_TIME_COLS = ["start_time", "heure_debut", "heure_debut_planning"];
const PLANNING_END_TIME_COLS = ["end_time", "heure_fin", "heure_fin_planning"];
const PLANNING_TYPE_COLS = ["type", "type_planning"];
const PLANNING_SHIFT_ID_COLS = ["type_shift_id", "shift_id"];
const PLANNING_SERVICE_ID_COLS = ["id_service", "service_id"];
const PLANNING_SERVICE_NAME_COLS = ["service", "service_planning"];
//tchof fama planning fi periode mo3ayna ilpersonnel
const buildPlanningDateMatchClause = (alias, cols, isoPlaceholder) => {
  const startCols = PLANNING_START_DATE_COLS.filter((c) => cols.has(c));
  if (!startCols.length) return "";
  const endCols = PLANNING_END_DATE_COLS.filter((c) => cols.has(c));
  return startCols
    .map((startCol) => {
      if (endCols.length) {
        const endExpr = `COALESCE(${endCols.map((c) => `${alias}.${c}`).join(", ")}, ${alias}.${startCol})`;
        return `(${alias}.${startCol}::date <= ${isoPlaceholder}::date AND ${endExpr}::date >= ${isoPlaceholder}::date)`;
      }
      return `(${alias}.${startCol}::date = ${isoPlaceholder}::date)`;
    })
    .join(" OR ");
};

const buildCoalesceExpr = (alias, cols, candidateCols, fallback = "NULL") => {
  const valid = candidateCols.filter((c) => cols.has(c)).map((c) => `${alias}.${c}`);
  return valid.length > 0 ? `COALESCE(${valid.join(", ")})` : fallback;
};

const buildPlanningSetQueryModel = ({
  table,
  idCol,
  cols,
  id,
  dateStart,
  dateEnd,
  startTime,
  endTime,
  type,
  typeShiftId,
  notes,
  adminMatricule,
  db = pool,
}) => {
  const params = [];
  const addParam = (value, cast = "") => {
    params.push(value);
    const placeholder = `$${params.length}`;
    return cast ? `${placeholder}::${cast}` : placeholder;
  };
  const sets = [];
  const pushMany = (candidateCols, value, cast = "") => {
    const hasAny = candidateCols.some((col) => cols.has(col));
    if (hasAny) {
      const expr = addParam(value, cast);
      candidateCols.forEach((col) => {
        if (cols.has(col)) sets.push(`${col} = ${expr}`);
      });
    }
  };

  if (dateStart) pushMany(PLANNING_START_DATE_COLS, dateStart, "date");
  if (dateEnd) pushMany(PLANNING_END_DATE_COLS, dateEnd, "date");
  if (startTime) pushMany(PLANNING_START_TIME_COLS, startTime, "time");
  if (endTime) pushMany(PLANNING_END_TIME_COLS, endTime, "time");
  if (type) pushMany(PLANNING_TYPE_COLS, type);
  if (typeShiftId !== undefined && typeShiftId !== null) pushMany(PLANNING_SHIFT_ID_COLS, typeShiftId, "int");
  if (notes !== undefined && cols.has("notes")) sets.push(`notes = ${addParam(notes || null)}`);
  if (cols.has("matricule_admin")) sets.push(`matricule_admin = ${addParam(adminMatricule || null)}`);

  if (!sets.length) return Promise.resolve();
  
  return require("../models/planningModel").updatePlanningRow({
    table, idCol, id, setSql: sets.join(", "), params
  }, db);
};

const insertPlanningRowModel = async ({
  table,
  idCol,
  cols,
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
  db = pool,
}) => {
  const insertCols = [];
  const valueExprs = [];
  const params = [];
  const add = (col, value, cast = "") => {
    if (!cols.has(col)) return;
    params.push(value);
    const placeholder = `$${params.length}`;
    insertCols.push(col);
    valueExprs.push(cast ? `${placeholder}::${cast}` : placeholder);
  };

  add("matricule", matricule);
  add("matricule_admin", adminMatricule || null);
  PLANNING_SERVICE_ID_COLS.forEach((col) => add(col, serviceId ?? null, "int"));
  PLANNING_SERVICE_NAME_COLS.forEach((col) => add(col, serviceName || null));
  PLANNING_START_DATE_COLS.forEach((col) => add(col, dateStart, "date"));
  PLANNING_END_DATE_COLS.forEach((col) => add(col, dateEnd || dateStart, "date"));
  PLANNING_START_TIME_COLS.forEach((col) => add(col, startTime, "time"));
  PLANNING_END_TIME_COLS.forEach((col) => add(col, endTime, "time"));
  PLANNING_TYPE_COLS.forEach((col) => add(col, type));
  if (typeShiftId !== undefined && typeShiftId !== null) {
    PLANNING_SHIFT_ID_COLS.forEach((col) => add(col, typeShiftId, "int"));
  }
  add("notes", notes || null);
  if (cols.has("created_at")) {
    insertCols.push("created_at");
    valueExprs.push("NOW()");
  }

  if (!insertCols.length) return null;
  const rows = await require("../models/planningModel").insertPlanningRow(
    `INSERT INTO ${table} (${insertCols.join(", ")}) VALUES (${valueExprs.join(", ")}) RETURNING ${idCol} AS id`,
    params, db
  );
  return rows[0]?.id || null;
};
const getPlanningStore = async (db = pool) => {
  const { rows } = await db.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema='public' AND table_name IN ('planning', 'plannings')`
  );
  const names = rows.map((r) => r.table_name);
  if (names.includes("planning")) return { table: "planning" };
  if (names.includes("plannings")) return { table: "plannings" };
  return null;
};

const hasConstraint = async (table, constraintName, db = pool) => {
  const { rows } = await db.query(
    `SELECT 1
     FROM information_schema.table_constraints
     WHERE table_schema='public' AND table_name = $1 AND constraint_name = $2
     LIMIT 1`,
    [table, constraintName]
  );
  return rows.length > 0;
};

const hasOrphanPlanningIds = async (planningTable, db = pool) => {
  const { rows } = await db.query(
    `SELECT 1
     FROM planning_requests r
     LEFT JOIN ${planningTable} p ON p.id = r.planning_id
     WHERE r.planning_id IS NOT NULL AND p.id IS NULL
     LIMIT 1`
  );
  return rows.length > 0;
};

const getPlanningRequestStore = async (db = pool) => {
  const { rows } = await db.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'planning_requests'`
  );
  return rows.length ? { table: "planning_requests" } : null;
};

const ensurePlanningRequestStore = async (db = pool) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS planning_requests (
      id SERIAL PRIMARY KEY,
      planning_id INTEGER,
      date_preferee DATE NOT NULL,
      shift_type VARCHAR(40) NOT NULL,
      raison TEXT NOT NULL,
      replacement_matricule VARCHAR(10),
      statut VARCHAR(40) NOT NULL DEFAULT 'En attente',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
 //zama nihihomm malekk
  await db.query("ALTER TABLE planning_requests ADD COLUMN IF NOT EXISTS planning_id INTEGER");
  await db.query("ALTER TABLE planning_requests ADD COLUMN IF NOT EXISTS date_preferee DATE");
  await db.query("ALTER TABLE planning_requests ADD COLUMN IF NOT EXISTS shift_type VARCHAR(40)");
  await db.query("ALTER TABLE planning_requests ADD COLUMN IF NOT EXISTS raison TEXT");
  await db.query("ALTER TABLE planning_requests ADD COLUMN IF NOT EXISTS replacement_matricule VARCHAR(10)");
  await db.query("ALTER TABLE planning_requests ADD COLUMN IF NOT EXISTS statut VARCHAR(40)");
  await db.query("ALTER TABLE planning_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()");
  await db.query("ALTER TABLE planning_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()");

  await db.query("CREATE INDEX IF NOT EXISTS idx_planning_requests_planning_id ON planning_requests (planning_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_planning_requests_status ON planning_requests (statut)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_planning_requests_date ON planning_requests (date_preferee)");
  await db.query(
    "CREATE INDEX IF NOT EXISTS idx_planning_requests_replacement_matricule ON planning_requests (replacement_matricule)"
  );

  try {
    const planningStore = await getPlanningStore(db);
    if (planningStore) {
      const fkName = "planning_requests_planning_id_fkey";
      const exists = await hasConstraint("planning_requests", fkName, db);
      if (!exists) {
        const hasOrphans = await hasOrphanPlanningIds(planningStore.table, db);
        if (!hasOrphans) {
          await db.query(
            `ALTER TABLE planning_requests
             ADD CONSTRAINT ${fkName}
             FOREIGN KEY (planning_id)
             REFERENCES ${planningStore.table}(id)
             ON UPDATE CASCADE
             ON DELETE RESTRICT`
          );
        } else {
          console.warn("ensurePlanningRequestStore: orphan planning_requests.planning_id found; skipping FK creation.");
        }
      }
    }
  } catch (error) {
    console.warn("ensurePlanningRequestStore: planning_id FK skipped:", error?.message || error);
  }

  try {
    await db.query("ALTER TABLE planning_requests ALTER COLUMN planning_id DROP NOT NULL");
  } catch (error) {
    console.warn("ensurePlanningRequestStore: planning_id nullable migration skipped:", error?.message || error);
  }

  return { table: "planning_requests" };
};
//trod statut ima refuse o annule
const expirePendingRequests = async (table, refusedStatus, isoToday, db = pool) => {
  await db.query(
    `UPDATE ${table}
     SET statut = $1, updated_at = NOW()
     WHERE COALESCE(statut, '') ILIKE 'en attente%'
       AND date_preferee::date < $2::date`,
    [refusedStatus, isoToday]
  );
};
//tchof fama request okhraa lilpersonne haka 
const fetchPlanningRequestConflict = async ({
  requestsTable,
  requestsIdCol,
  requestsFkCol,
  planningTable,
  planningIdCol,
  matricule,
  isoDate,
  excludeRequestId = null,
}, db = pool) => {
  const params = [matricule, isoDate];
  const excludeClause =
    Number.isFinite(Number(excludeRequestId)) && Number(excludeRequestId) > 0
      ? `AND r.${requestsIdCol} <> $${params.push(Number(excludeRequestId))}`
      : "";

  const { rows } = await db.query(
    `SELECT r.${requestsIdCol} AS id, r.statut
     FROM ${requestsTable} r
     JOIN ${planningTable} p ON p.${planningIdCol} = r.${requestsFkCol}
     WHERE p.matricule = $1
       AND r.date_preferee = $2::date
       AND COALESCE(r.statut, '') NOT ILIKE 'annul%'
       AND COALESCE(r.statut, '') NOT ILIKE 'refus%'
       ${excludeClause}
     ORDER BY r.created_at DESC, r.${requestsIdCol} DESC
     LIMIT 1`,
    params
  );
  return rows[0] || null;
};
//tijbid liste de planningrequest mt3 personnel 
const fetchPlanningRequestsList = async ({ requests, planning, where, params }, db = pool) => {
  const { rows } = await db.query(
    `SELECT r.${requests.idCol} AS id,
            r.${requests.planningFkCol} AS planning_id,
            p.matricule,
            r.date_preferee,
            r.shift_type,
            r.raison,
            r.replacement_matricule,
            r.statut,
            r.created_at,
            r.updated_at
     FROM ${requests.table} r
     LEFT JOIN ${planning.table} p ON p.${planning.idCol} = r.${requests.planningFkCol}
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY r.created_at DESC, r.${requests.idCol} DESC`,
    params
  );
  return rows;
};

const fetchPlanningRequestsAdminList = async ({ requests, planning, selectJoinStr, joinsStr = "" }, db = pool) => {
  const { rows } = await db.query(
    `SELECT ${selectJoinStr}
     FROM ${requests.table} r
     LEFT JOIN ${planning.table} p ON p.${planning.idCol} = r.${requests.planningFkCol}
     LEFT JOIN utilisateur u ON u.matricule = p.matricule
     ${joinsStr}
     ORDER BY r.created_at DESC, r.${requests.idCol} DESC`
  );
  return rows;
};

const insertPlanningRequest = async ({ requests, planningId, desiredIso, normalizedShift, safeReason, pendingStatus }, db = pool) => {
  const { rows } = await db.query(
    `INSERT INTO ${requests.table} (${requests.planningFkCol}, date_preferee, shift_type, raison, statut)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${requests.idCol} AS id, ${requests.planningFkCol} AS planning_id, date_preferee, shift_type, raison, statut, created_at, updated_at`,
    [planningId, desiredIso, normalizedShift, safeReason, pendingStatus]
  );
  return rows[0];
};

const fetchPlanningRequestById = async ({ requests, planning, id }, db = pool) => {
  const { rows } = await db.query(
    `SELECT r.${requests.idCol} AS id, r.${requests.planningFkCol} AS planning_id, r.statut, p.matricule,
            r.date_preferee, r.shift_type, r.raison
     FROM ${requests.table} r
     LEFT JOIN ${planning.table} p ON p.${planning.idCol} = r.${requests.planningFkCol}
     WHERE r.${requests.idCol} = $1`,
    [id]
  );
  return rows;
};

const updatePlanningRequestStatus = async ({ requests, status, id }, db = pool) => {
  const { rows } = await db.query(
    `UPDATE ${requests.table}
     SET statut = $1, updated_at = NOW()
     WHERE ${requests.idCol} = $2
     RETURNING ${requests.idCol} AS id, ${requests.planningFkCol} AS planning_id, date_preferee, shift_type, raison, statut, created_at, updated_at`,
    [status, id]
  );
  return rows[0];
};

const updatePlanningRequest = async ({ requests, planningId, desiredIso, normalizedShift, safeReason, id }, db = pool) => {
  const { rows } = await db.query(
    `UPDATE ${requests.table}
     SET ${requests.planningFkCol} = $1, date_preferee = $2, shift_type = $3, raison = $4, updated_at = NOW()
     WHERE ${requests.idCol} = $5
     RETURNING ${requests.idCol} AS id, ${requests.planningFkCol} AS planning_id, date_preferee, shift_type, raison, statut, created_at, updated_at`,
    [planningId, desiredIso, normalizedShift, safeReason, id]
  );
  return rows[0];
};
//wktili t'approuver o annul o refuse planningrequest tbloki ma3adich tnajam taml hata modification 
const fetchPlanningRequestForUpdate = async ({ requests, planning, id }, db = pool) => {
  const { rows } = await db.query(
    `SELECT r.${requests.idCol} AS id,
            r.${requests.planningFkCol} AS planning_id,
            r.date_preferee,
            r.shift_type,
            r.raison,
            r.statut,
            p.matricule
     FROM ${requests.table} r
     LEFT JOIN ${planning.table} p ON p.${planning.idCol} = r.${requests.planningFkCol}
     WHERE r.${requests.idCol} = $1
     FOR UPDATE OF r`,
    [id]
  );
  return rows;
};

const updatePlanningRequestRefused = async ({ requests, refusedStatus, id }, db = pool) => {
  const { rows } = await db.query(
    `UPDATE ${requests.table}
     SET statut = $1, replacement_matricule = NULL, updated_at = NOW()
     WHERE ${requests.idCol} = $2
     RETURNING ${requests.idCol} AS id,
               ${requests.planningFkCol} AS planning_id,
               date_preferee, shift_type, raison, replacement_matricule, statut, created_at, updated_at`,
    [refusedStatus, id]
  );
  return rows[0];
};

const updatePlanningRequestApproved = async ({ requests, approvedStatus, replacementMatricule, id }, db = pool) => {
  const { rows } = await db.query(
    `UPDATE ${requests.table}
     SET statut = $1, replacement_matricule = $3, updated_at = NOW()
     WHERE ${requests.idCol} = $2
     RETURNING ${requests.idCol} AS id,
               ${requests.planningFkCol} AS planning_id,
               date_preferee, shift_type, raison, replacement_matricule, statut, created_at, updated_at`,
    [approvedStatus, id, replacementMatricule]
  );
  return rows[0];
};

const fetchPlanningEntryForDateForUpdate = async ({ planning, planningCols, planningId, fallbackMatricule, isoDate }, db = pool) => {
  const clauseByDate = buildPlanningDateMatchClause("p", planningCols, "$2");
  if (!clauseByDate) return null;

  const dateStartExpr = buildCoalesceExpr("p", planningCols, PLANNING_START_DATE_COLS, "NULL");
  const dateEndExpr = buildCoalesceExpr("p", planningCols, PLANNING_END_DATE_COLS, dateStartExpr);
  const startTimeExpr = buildCoalesceExpr("p", planningCols, PLANNING_START_TIME_COLS, "NULL");
  const endTimeExpr = buildCoalesceExpr("p", planningCols, PLANNING_END_TIME_COLS, "NULL");
  const typeExpr = buildCoalesceExpr("p", planningCols, PLANNING_TYPE_COLS, "''");
  const shiftIdExpr = buildCoalesceExpr("p", planningCols, PLANNING_SHIFT_ID_COLS, "NULL");
  const notesExpr = buildCoalesceExpr("p", planningCols, ["notes"], "''");
  const serviceIdExpr = buildCoalesceExpr("p", planningCols, PLANNING_SERVICE_ID_COLS, "NULL");
  const serviceNameExpr = buildCoalesceExpr("p", planningCols, PLANNING_SERVICE_NAME_COLS, "''");

  const selectSql = `SELECT p.${planning.idCol} AS id,
                            p.matricule,
                            ${dateStartExpr} AS date_start,
                            ${dateEndExpr} AS date_end,
                            ${startTimeExpr} AS start_time,
                            ${endTimeExpr} AS end_time,
                            ${shiftIdExpr} AS type_shift_id,
                            COALESCE(ts.type_shift, ${typeExpr}) AS type,
                            COALESCE(${notesExpr}, '') AS notes,
                            ${serviceIdExpr} AS id_service,
                            COALESCE(${serviceNameExpr}, '') AS service_name
                     FROM ${planning.table} p
                     LEFT JOIN type_shift ts ON ts.id = ${shiftIdExpr}`;

  if (Number.isFinite(Number(planningId)) && Number(planningId) > 0) {
    const { rows } = await db.query(
      `${selectSql} WHERE p.${planning.idCol} = $1 AND (${clauseByDate}) LIMIT 1 FOR UPDATE OF p`,
      [Number(planningId), isoDate]
    );
    if (rows.length) return rows[0];
  }
  if (!fallbackMatricule) return null;
  const { rows } = await db.query(
    `${selectSql} WHERE p.matricule = $1 AND (${clauseByDate}) ORDER BY p.${planning.idCol} DESC LIMIT 1 FOR UPDATE OF p`,
    [fallbackMatricule, isoDate]
  );
  return rows[0] || null;
};
//tijbid planning mt3 personnel finhar haka 
const fetchPlanningRowForDate = async ({ table, idCol, matricule, clause, isoDate }, db = pool) => {
  const { rows } = await db.query(
    `SELECT p.${idCol} AS id, p.matricule
     FROM ${table} p
     WHERE p.matricule = $1 AND (${clause})
     ORDER BY p.${idCol} DESC
     LIMIT 1`,
    [matricule, isoDate]
  );
  return rows[0] || null;
};

const fetchPlanningRowByIdForDate = async ({ table, idCol, planningId, clause, isoDate }, db = pool) => {
  const { rows } = await db.query(
    `SELECT p.${idCol} AS id, p.matricule
     FROM ${table} p
     WHERE p.${idCol} = $1 AND (${clause})
     LIMIT 1`,
    [planningId, isoDate]
  );
  return rows[0] || null;
};

module.exports = {
  getPlanningRequestStore,
  ensurePlanningRequestStore,
  expirePendingRequests,
  fetchPlanningRequestConflict,
  fetchPlanningRequestsList,
  fetchPlanningRequestsAdminList,
  insertPlanningRequest,
  fetchPlanningRequestById,
  updatePlanningRequestStatus,
  updatePlanningRequest,
  fetchPlanningRequestForUpdate,
  updatePlanningRequestRefused,
  updatePlanningRequestApproved,
  fetchPlanningEntryForDateForUpdate,
  fetchPlanningRowForDate,
  fetchPlanningRowByIdForDate,
  PLANNING_ID_COLS,
  REQUEST_ID_COLS,
  REQUEST_PLANNING_FK_COLS,
  buildPlanningDateMatchClause,
  buildPlanningSetQueryModel,
  insertPlanningRowModel,
};