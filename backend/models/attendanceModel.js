const pool = require("../config/db");

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
     FROM ${table} a
     LEFT JOIN utilisateur u ON u.matricule = a.matricule
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
      console.warn(`ensureAttendanceStore: utilisateur.matricule is not UNIQUE/PK; skipping FK creation for ${table}.`);
      return;
    }

    const exists = await hasConstraint(table, fkName, db);
    if (exists) return;

    const hasOrphans = await hasOrphanMatricules(table, db);
    if (hasOrphans) {
      console.warn(`ensureAttendanceStore: orphan ${table}.matricule found; skipping FK creation.`);
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
    console.warn("ensureAttendanceStore: matricule FK skipped:", error?.message || error);
  }
};

const ensureAttendanceStore = async (db = pool) => {
  const table = "attendance_events";

  await db.query(
    `CREATE TABLE IF NOT EXISTS ${table} (
      id_attendance SERIAL PRIMARY KEY,
      matricule VARCHAR(10) NOT NULL,
      event_type VARCHAR(20) NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      client_time TIMESTAMPTZ NULL,
      latitude DOUBLE PRECISION NULL,
      longitude DOUBLE PRECISION NULL,
      accuracy_m DOUBLE PRECISION NULL,
      within_geofence BOOLEAN NULL,
      distance_m DOUBLE PRECISION NULL,
      geofence_lat DOUBLE PRECISION NULL,
      geofence_lng DOUBLE PRECISION NULL,
      geofence_radius_m DOUBLE PRECISION NULL
    )`
  );

  await db.query(`CREATE INDEX IF NOT EXISTS idx_${table}_matricule_time ON ${table} (matricule, recorded_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_${table}_matricule_type_time ON ${table} (matricule, event_type, recorded_at DESC)`);

  await ensureMatriculeFkToUtilisateur(table, db);
  return { table };
};

const insertAttendanceEvent = async (
  {
    matricule,
    eventType,
    clientTime,
    latitude,
    longitude,
    accuracyM,
    withinGeofence,
    distanceM,
    geofenceLat,
    geofenceLng,
    geofenceRadiusM,
  },
  db = pool
) => {
  const store = await ensureAttendanceStore(db);
  const { rows } = await db.query(
    `INSERT INTO ${store.table} (
      matricule,
      event_type,
      client_time,
      latitude,
      longitude,
      accuracy_m,
      within_geofence,
      distance_m,
      geofence_lat,
      geofence_lng,
      geofence_radius_m
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *`,
    [
      matricule,
      eventType,
      clientTime ? new Date(clientTime) : null,
      Number.isFinite(latitude) ? latitude : null,
      Number.isFinite(longitude) ? longitude : null,
      Number.isFinite(accuracyM) ? accuracyM : null,
      typeof withinGeofence === "boolean" ? withinGeofence : null,
      Number.isFinite(distanceM) ? distanceM : null,
      Number.isFinite(geofenceLat) ? geofenceLat : null,
      Number.isFinite(geofenceLng) ? geofenceLng : null,
      Number.isFinite(geofenceRadiusM) ? geofenceRadiusM : null,
    ]
  );
  return rows[0] || null;
};

const fetchTodaySummary = async (matricule, db = pool) => {
  if (!matricule) return null;
  const store = await ensureAttendanceStore(db);

  const { rows } = await db.query(
    `SELECT
       $1::varchar(10) AS matricule,
       CURRENT_DATE::text AS date,
       MIN(recorded_at) FILTER (WHERE event_type='check_in') AS check_in_time,
       MAX(recorded_at) FILTER (WHERE event_type='check_out') AS check_out_time
     FROM ${store.table}
     WHERE matricule = $1
       AND recorded_at::date = CURRENT_DATE`,
    [matricule]
  );
  return rows[0] || null;
};

const hasTodayEvent = async (matricule, eventType, db = pool) => {
  if (!matricule || !eventType) return false;
  const store = await ensureAttendanceStore(db);
  const { rows } = await db.query(
    `SELECT 1
     FROM ${store.table}
     WHERE matricule = $1
       AND event_type = $2
       AND recorded_at::date = CURRENT_DATE
     LIMIT 1`,
    [matricule, eventType]
  );
  return rows.length > 0;
};

const listWorkSessionsForMonth = async ({ matricule, mois, annee }, db = pool) => {
  if (!matricule) return [];
  const store = await ensureAttendanceStore(db);

  const month = Number.parseInt(String(mois), 10);
  const year = Number.parseInt(String(annee), 10);
  if (!Number.isInteger(month) || month < 1 || month > 12) return [];
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return [];

  const { rows } = await db.query(
    `WITH bounds AS (
       SELECT make_timestamptz($3, $2, 1, 0, 0, 0) AS month_start
     )
     SELECT
       c.recorded_at::date AS date,
       c.recorded_at AS check_in_time,
       co.check_out_time,
       COALESCE(EXTRACT(EPOCH FROM (co.check_out_time - c.recorded_at)) / 3600.0, 0) AS hours_worked
     FROM ${store.table} c
     CROSS JOIN bounds b
     LEFT JOIN LATERAL (
       SELECT o.recorded_at AS check_out_time
       FROM ${store.table} o
       WHERE o.matricule = c.matricule
         AND o.event_type = 'check_out'
         AND o.recorded_at > c.recorded_at
         AND o.recorded_at <= (c.recorded_at + INTERVAL '24 hours')
       ORDER BY o.recorded_at ASC
       LIMIT 1
     ) co ON TRUE
     WHERE c.matricule = $1
       AND c.event_type = 'check_in'
       AND c.recorded_at >= b.month_start
       AND c.recorded_at < (b.month_start + INTERVAL '1 month')
     ORDER BY c.recorded_at ASC`,
    [matricule, month, year]
  );

  return rows.map((r) => ({
    date: r.date ? String(r.date) : null,
    check_in_time: r.check_in_time ?? null,
    check_out_time: r.check_out_time ?? null,
    hours_worked: Number(r.hours_worked) || 0,
  }));
};

const listTodayAttendanceSummary = async (db = pool) => {
  const store = await ensureAttendanceStore(db);
  const { rows } = await db.query(
    `SELECT
       e.matricule,
       MIN(e.recorded_at) FILTER (WHERE e.event_type='check_in') AS check_in_time,
       MAX(e.recorded_at) FILTER (WHERE e.event_type='check_out') AS check_out_time,
       MAX(e.recorded_at) AS last_event_time,
       (ARRAY_AGG(e.event_type ORDER BY e.recorded_at DESC))[1] AS last_event_type
     FROM ${store.table} e
     WHERE e.recorded_at::date = CURRENT_DATE
     GROUP BY e.matricule
     ORDER BY last_event_time DESC NULLS LAST, e.matricule ASC`
  );

  return rows.map((row) => ({
    matricule: String(row?.matricule || ""),
    check_in_time: row?.check_in_time || null,
    check_out_time: row?.check_out_time || null,
    last_event_time: row?.last_event_time || null,
    last_event_type: row?.last_event_type || null,
  }));
};

const listRecentAttendanceEvents = async ({ limit = 30, days = 2 } = {}, db = pool) => {
  const store = await ensureAttendanceStore(db);
  const safeLimit = Number.isInteger(Number(limit)) ? Math.min(Math.max(Number(limit), 1), 200) : 30;
  const safeDays = Number.isInteger(Number(days)) ? Math.min(Math.max(Number(days), 1), 30) : 2;

  const { rows } = await db.query(
    `SELECT
       e.matricule,
       e.event_type,
       e.recorded_at
     FROM ${store.table} e
     WHERE e.recorded_at::date >= (CURRENT_DATE - ($1::int - 1))
     ORDER BY e.recorded_at DESC
     LIMIT $2`,
    [safeDays, safeLimit]
  );

  return rows.map((row) => ({
    matricule: String(row?.matricule || ""),
    event_type: row?.event_type || "",
    recorded_at: row?.recorded_at || null,
  }));
};

const listDailyCheckInsByDate = async ({ days = 30 } = {}, db = pool) => {
  const store = await ensureAttendanceStore(db);
  const safeDays = Number.isInteger(Number(days)) ? Math.min(Math.max(Number(days), 1), 120) : 30;

  const { rows } = await db.query(
    `SELECT
       d.day::text AS date,
       ARRAY_AGG(DISTINCT d.matricule ORDER BY d.matricule) AS matricules
     FROM (
       SELECT e.recorded_at::date AS day, e.matricule
       FROM ${store.table} e
       WHERE e.event_type = 'check_in'
         AND e.recorded_at::date >= (CURRENT_DATE - ($1::int - 1))
     ) d
     GROUP BY d.day
     ORDER BY d.day ASC`,
    [safeDays]
  );

  return rows.map((row) => ({
    date: String(row?.date || ""),
    matricules: Array.isArray(row?.matricules) ? row.matricules.map((m) => String(m || "")) : [],
  }));
};

module.exports = {
  ensureAttendanceStore,
  insertAttendanceEvent,
  fetchTodaySummary,
  hasTodayEvent,
  listWorkSessionsForMonth,
  listTodayAttendanceSummary,
  listRecentAttendanceEvents,
  listDailyCheckInsByDate,
};