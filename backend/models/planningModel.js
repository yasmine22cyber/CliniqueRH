const pool = require("../config/db");
const typeShiftModel = require("./typeShiftModel");
const { getTableColumns, ensureAdminMatriculeConstraints } = require("./dbUtils");

const hasUniqueOrPrimaryKeyOnColumn = async (table, column, db = pool) => {
  const { rows } = await db.query(
    `SELECT 1
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema='public'
       AND tc.table_name = $1
       AND kcu.column_name = $2
       AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
     LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
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

const listForeignKeysForColumn = async (table, column, db = pool) => {
  const { rows } = await db.query(
    `SELECT
        tc.constraint_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
     WHERE tc.table_schema='public'
       AND tc.table_name = $1
       AND tc.constraint_type = 'FOREIGN KEY'
       AND kcu.column_name = $2`,
    [table, column]
  );
  return rows;
};

const hasOrphanMatricules = async (table, db = pool) => {
  const { rows } = await db.query(
    `SELECT 1
     FROM ${table} p
     LEFT JOIN utilisateur u ON u.matricule = p.matricule
     WHERE u.matricule IS NULL
     LIMIT 1`
  );
  return rows.length > 0;
};

const ensureMatriculeFkToUtilisateur = async (table, db = pool) => {
  try {
    const { rows } = await db.query(
      `SELECT 1
       FROM information_schema.tables
       WHERE table_schema='public' AND table_name = 'utilisateur'
       LIMIT 1`
    );
    const hasUtilisateur = rows.length > 0;
    if (!hasUtilisateur) return;

    const fkName = `${table}_matricule_utilisateur_fkey`;

    const existingFks = await listForeignKeysForColumn(table, "matricule", db);
    const utilisateurFks = existingFks.filter(
      (row) => row.foreign_table_name === "utilisateur" && row.foreign_column_name === "matricule"
    );
    if (utilisateurFks.length > 0) {
      if (utilisateurFks.length > 1 && utilisateurFks.some((r) => r.constraint_name === fkName)) {
        await db.query(`ALTER TABLE ${table} DROP CONSTRAINT ${fkName}`);
      }
      return;
    }

    const canReference = await hasUniqueOrPrimaryKeyOnColumn("utilisateur", "matricule", db);
    if (!canReference) {
      console.warn(`ensurePlanningStore: utilisateur.matricule is not UNIQUE/PK; skipping FK creation for ${table}.`);
      return;
    }

    const exists = await hasConstraint(table, fkName, db);
    if (exists) return;

    const hasOrphans = await hasOrphanMatricules(table, db);
    if (hasOrphans) {
      console.warn(`ensurePlanningStore: orphan ${table}.matricule found; skipping FK creation.`);
      return;
    }

    await db.query(
      `ALTER TABLE ${table}
       ADD CONSTRAINT ${fkName}
       FOREIGN KEY (matricule)
       REFERENCES utilisateur(matricule)
       ON UPDATE CASCADE
       ON DELETE RESTRICT`
    );
  } catch (error) {
    console.warn("ensurePlanningStore: matricule FK skipped:", error?.message || error);
  }
};


const resolvePlanningTypeColumn = (cols = new Set()) =>
  (cols.has("type") ? "type" : cols.has("type_planning") ? "type_planning" : null);

const hasOrphanShiftIds = async (table, shiftIdCol, db = pool) => {
  const { rows } = await db.query(
    `SELECT 1
     FROM ${table} p
     LEFT JOIN type_shift s ON s.id = p.${shiftIdCol}
     WHERE p.${shiftIdCol} IS NOT NULL
       AND s.id IS NULL
     LIMIT 1`
  );
  return rows.length > 0;
};

const ensurePlanningShiftIdFkToTypeShift = async (table, db = pool) => {
  try {
    await typeShiftModel.ensureTypeShiftStore(db);

    const cols = await getTableColumns(table, db).catch(() => new Set());
    const shiftIdCol = cols.has("type_shift_id") ? "type_shift_id" : cols.has("shift_id") ? "shift_id" : null;
    const typeCol = resolvePlanningTypeColumn(cols);
    if (!shiftIdCol) return;

    if (typeCol) {
      await db.query(
        `UPDATE ${table} p
         SET ${shiftIdCol} = s.id
         FROM type_shift s
         WHERE p.${shiftIdCol} IS NULL
           AND TRIM(COALESCE(p.${typeCol}, '')) <> ''
           AND LOWER(TRIM(
             CASE
               WHEN LOWER(TRIM(COALESCE(p.${typeCol}, ''))) = 'apres midi' THEN 'apres-midi'
               WHEN LOWER(TRIM(COALESCE(p.${typeCol}, ''))) = 'nuit' THEN 'garde'
               ELSE COALESCE(p.${typeCol}, '')
             END
           )) = LOWER(TRIM(s.type_shift))`
      );
      await db.query(
        `UPDATE ${table} p
         SET ${typeCol} = s.type_shift
         FROM type_shift s
         WHERE p.${shiftIdCol} = s.id
           AND (
             p.${typeCol} IS NULL
             OR TRIM(COALESCE(p.${typeCol}, '')) = ''
             OR LOWER(TRIM(COALESCE(p.${typeCol}, ''))) <> LOWER(TRIM(s.type_shift))
           )`
      );
    }

    const fkName = `${table}_${shiftIdCol}_type_shift_fkey`;
    const existingFks = await listForeignKeysForColumn(table, shiftIdCol, db);
    const typeShiftFks = existingFks.filter(
      (row) => row.foreign_table_name === "type_shift" && row.foreign_column_name === "id"
    );

    if (typeShiftFks.length > 0) {
      if (typeShiftFks.length > 1 && typeShiftFks.some((r) => r.constraint_name === fkName)) {
        await db.query(`ALTER TABLE ${table} DROP CONSTRAINT ${fkName}`);
      }
      return;
    }

    const exists = await hasConstraint(table, fkName, db);
    if (exists) return;

    const hasOrphans = await hasOrphanShiftIds(table, shiftIdCol, db);
    if (hasOrphans) {
      console.warn(`ensurePlanningStore: orphan ${table}.${shiftIdCol} found; skipping FK creation.`);
      return;
    }

    await db.query(
      `ALTER TABLE ${table}
       ADD CONSTRAINT ${fkName}
       FOREIGN KEY (${shiftIdCol})
       REFERENCES type_shift(id)
       ON UPDATE CASCADE
       ON DELETE RESTRICT`
    );
  } catch (error) {
    console.warn("ensurePlanningStore: shift FK skipped:", error?.message || error);
  }
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

const ensurePlanningCoreColumns = async (table, db = pool) => {
  await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS id_service INTEGER NULL`);
  await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS matricule_admin VARCHAR(10)`);
  await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS date_debut DATE`);
  await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS date_fin DATE`);
  await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS start_time TIME`);
  await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS end_time TIME`);
  await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS type_shift_id INTEGER NULL`);
  await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS notes TEXT`);
  await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`);
};

const ensurePlanningTableIndexesAndConstraints = async (table, db = pool) => {
  await db.query(`CREATE INDEX IF NOT EXISTS idx_${table}_matricule ON ${table} (matricule)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_${table}_matricule_admin ON ${table} (matricule_admin)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_${table}_type_shift_id ON ${table} (type_shift_id)`);
  await ensureAdminMatriculeConstraints(table, db).catch(() => null);
  await ensureMatriculeFkToUtilisateur(table, db);
  await ensurePlanningShiftIdFkToTypeShift(table, db);
};

const ensurePlanningStore = async (db = pool) => {
  const existing = await getPlanningStore(db);
  if (existing) {
    await ensurePlanningCoreColumns(existing.table, db);
    await ensurePlanningTableIndexesAndConstraints(existing.table, db);
    return existing;
  }

  await typeShiftModel.ensureTypeShiftStore(db);
  await db.query(
    `CREATE TABLE IF NOT EXISTS planning (
      id_planning SERIAL PRIMARY KEY,
      matricule VARCHAR(10) NOT NULL,
      matricule_admin VARCHAR(10) NULL,
      id_service INTEGER NULL,
      date_debut DATE NOT NULL,
      date_fin DATE NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      type_shift_id INTEGER NOT NULL REFERENCES type_shift(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`
  );

  await ensurePlanningTableIndexesAndConstraints("planning", db);
  return { table: "planning" };
};
//tjib les information de grade w service mta3 personnel 
const fetchPersonnelMeta = async (matricule, db = pool) => {
  if (!matricule) return null;
  const { getUtilisateurColumns } = require("./dbUtils");
  const { getGradeStore } = require("./gradeModel");
  const cols = await getUtilisateurColumns(db).catch(() => []);
  if (!cols.length) return null;
  const hasIdGrade = cols.includes("id_grade");
  const hasLegacyGrade = cols.includes("grade");
  const hasIdService = cols.includes("id_service");
  const hasServiceName = cols.includes("service");
  const gradeStore = await getGradeStore(db).catch(() => null);

  let gradeSelect = "''";
  let gradeJoin = "";
  if (hasIdGrade && gradeStore) {
    gradeSelect = `COALESCE(g.${gradeStore.labelCol}, '')`;
    gradeJoin = `LEFT JOIN ${gradeStore.table} g ON g.${gradeStore.idCol} = u.id_grade`;
  } else if (hasLegacyGrade) {
    gradeSelect = "COALESCE(u.grade, '')";
  }

  const serviceIdSelect = hasIdService ? "u.id_service" : "NULL";
  const serviceNameSelect = hasServiceName ? "COALESCE(u.service, '')" : "''";

  const { rows } = await db.query(
    `SELECT ${gradeSelect} AS grade,
            ${serviceIdSelect} AS id_service,
            ${serviceNameSelect} AS service
     FROM utilisateur u
     ${gradeJoin}
     WHERE u.matricule = $1
     LIMIT 1`,
    [matricule]
  );
  if (!rows.length) return null;
  return {
    grade: rows[0]?.grade || "",
    serviceId: rows[0]?.id_service ?? null,
    serviceName: rows[0]?.service || "",
  };
};
//traja3 les planning ilimawjodinn fidb
const fetchPlanningRows = async ({ table, planningIdCol, planningCols, serviceStore, userCols, matriculeFilter = null }, db = pool) => {
  const { getGradeStore } = require("./gradeModel");
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

  const coalesceSql = (alias, candidates, fallbackSql) => {
    const picked = candidates.filter((c) => planningCols.has(c)).map((c) => `${alias}.${c}`);
    if (!picked.length) return fallbackSql;
    if (picked.length === 1) return picked[0];
    return `COALESCE(${picked.join(", ")})`;
  };

  const dateSql = coalesceSql("p", ["date", "date_debut", "date_debut_planning"], "NULL");
  const dateFinSql = coalesceSql("p", ["date_fin", "date_fin_planning"], dateSql);
  const startSql = coalesceSql("p", ["start_time", "heure_debut", "heure_debut_planning"], "NULL");
  const endSql = coalesceSql("p", ["end_time", "heure_fin", "heure_fin_planning"], "NULL");
  const typeSql = coalesceSql("p", ["type", "type_planning"], "''");
  const notesSql = coalesceSql("p", ["notes"], "''");
  const idServiceSql = coalesceSql("p", ["id_service", "service_id"], "NULL");
  const shiftIdCol = planningCols.has("type_shift_id")
    ? "type_shift_id"
    : planningCols.has("shift_id")
      ? "shift_id"
      : null;
  const shiftJoin = shiftIdCol ? `LEFT JOIN type_shift ts ON ts.id = p.${shiftIdCol}` : "";
  const typeSelectSql = shiftIdCol ? `COALESCE(ts.type_shift, ${typeSql})` : typeSql;
  const typeShiftIdSql = shiftIdCol ? `p.${shiftIdCol}` : "NULL";

  const hasUserIdGrade = userCols.includes("id_grade");
  const gradeStore = hasUserIdGrade ? await getGradeStore(db).catch(() => null) : null;
  const gradeSelect =
    gradeStore && hasUserIdGrade
      ? `COALESCE(g.${gradeStore.labelCol}, '') AS grade`
      : userCols.includes("grade")
        ? "COALESCE(u.grade, '') AS grade"
        : "'' AS grade";
  const gradeJoin =
    gradeStore && hasUserIdGrade
      ? `LEFT JOIN ${gradeStore.table} g ON g.${gradeStore.idCol} = u.id_grade`
      : "";

  const params = [];
  const whereParts = [];
  if (matriculeFilter) {
    params.push(matriculeFilter);
    whereParts.push(`p.matricule = $${params.length}`);
  }
  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  const { rows } = await db.query(
    `SELECT p.${planningIdCol} AS id,
            p.matricule,
            COALESCE(p.matricule_admin, '') AS matricule_admin,
            ${idServiceSql} AS id_service,
            ${dateSql} AS date,
            ${dateFinSql} AS date_fin,
            ${startSql} AS start_time,
            ${endSql} AS end_time,
            ${typeShiftIdSql} AS type_shift_id,
            ${typeSelectSql} AS type,
            COALESCE(${notesSql}, '') AS notes,
            u.nom,
            u.prenom,
            ${gradeSelect},
            ${serviceSelect}
     FROM ${table} p
     LEFT JOIN utilisateur u ON u.matricule = p.matricule
     ${shiftJoin}
     ${gradeJoin}
     ${serviceJoin}
     ${whereSql}
     ORDER BY date DESC NULLS LAST, start_time ASC NULLS LAST`,
    params
  );  
  return rows;
};
//personnel deja 3andoo emploi finafis periode 
const hasPlanningOverlapDB = async ({ table, overlapClause, matricule, startIso, endIso }, db = pool) => {
  if (!table || !matricule || !startIso || !endIso || !overlapClause) return false;
  const { rows } = await db.query(
    `SELECT 1
     FROM ${table} p
     WHERE p.matricule = $1
       AND (${overlapClause})
     LIMIT 1`,
    [matricule, startIso, endIso]
  );
  return rows.length > 0;
};
const fetchPlanningById = async (table, planningIdCol, id, db = pool) => {
  const { rows, rowCount } = await db.query(
    `SELECT ${planningIdCol} FROM ${table} WHERE ${planningIdCol}=$1`,
    [id]
  );
  return { found: rowCount > 0, row: rows[0] };
};
//zama zayda
const deletePlanningRequests = async (requestsTable, planningId, db = pool) => {
  await db.query(`DELETE FROM ${requestsTable} WHERE planning_id=$1`, [planningId]);
};

const deletePlanningById = async (table, planningIdCol, id, db = pool) => {
  await db.query(`DELETE FROM ${table} WHERE ${planningIdCol}=$1`, [id]);
};

const insertPlanningRow = async (text, values, db = pool) => {
  const { rows } = await db.query(text, values);
  return rows;
};

const updatePlanningRow = async ({ table, idCol, id, setSql, params }, db = pool) => {
  const { rows } = await db.query(
    `UPDATE ${table} SET ${setSql} WHERE ${idCol} = $${params.length + 1} RETURNING ${idCol} AS id`,
    [...params, id]
  );
  return rows[0];
};

const personnelExists = async (matricule, db = pool) => {
  const { rows } = await db.query("SELECT 1 FROM utilisateur WHERE matricule=$1 LIMIT 1", [matricule]);
  return rows.length > 0;
};
module.exports = {
  getPlanningStore,
  ensurePlanningStore,
  fetchPersonnelMeta,
  fetchPlanningRows,
  hasPlanningOverlapDB,
  fetchPlanningById,
  deletePlanningRequests,
  deletePlanningById,
  insertPlanningRow,
  updatePlanningRow,
  personnelExists,
};