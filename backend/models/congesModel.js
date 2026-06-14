const pool = require("../config/db");
const { getServiceStore, resolveServiceNameById } = require("./serviceModel");
const { getGradeStore } = require("./gradeModel");
const { getUtilisateurColumns } = require("./utilisateurModel");
const { getTypesCongeStore } = require("./typesCongeModel");
const { ensureAdminMatriculeConstraints } = require("./dbUtils");

const getCongeStore = async (db = pool) => {
  const { rows } = await db.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema='public' AND table_name = 'conges'`
  );
  return rows.length ? { table: "conges" } : null;
};

const getTableColumns = async (table, db = pool) => {
  const { rows } = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return new Set(rows.map((r) => r.column_name));
};

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
//tchouf idha fama matricule fil conge ama moush mawjouda fel utilisateur
const hasOrphanMatricules = async (db = pool) => {
  const { rows } = await db.query(
    `SELECT 1
     FROM conges c
     LEFT JOIN utilisateur u ON u.matricule = c.matricule
     WHERE u.matricule IS NULL
     LIMIT 1`
  );
  return rows.length > 0;
};

const ensureCongeStore = async (db = pool) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS conges (
      id_conge SERIAL PRIMARY KEY,
      matricule VARCHAR(10) NOT NULL,
      date_debut DATE NOT NULL,
      date_fin DATE NOT NULL,
      statut VARCHAR(40) NOT NULL DEFAULT 'En attente'
    )
  `);

  await db.query(`
    ALTER TABLE conges 
    ADD COLUMN IF NOT EXISTS type_conge_id INTEGER,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS raison TEXT,
    ADD COLUMN IF NOT EXISTS matricule_admin VARCHAR(10)
    `);

  try {
    const nullCount = await db.query("SELECT COUNT(*)::int AS c FROM conges WHERE raison IS NULL");
    if ((nullCount.rows[0]?.c ?? 0) === 0) {
      await db.query("ALTER TABLE conges ALTER COLUMN raison SET NOT NULL");
    }
  } catch (error) {
     console.warn("ensureCongeStore: raison NOT NULL check skipped:", error?.message || error);
  }

  try {
    await db.query(
      `
        UPDATE conges
        SET matricule_admin = NULL
        WHERE COALESCE(statut, '') ILIKE 'en attente%'
          AND matricule_admin IS NOT NULL
      `
    );
  } catch (error) {
    console.warn(
      "ensureCongeStore: pending matricule_admin cleanup skipped:",
      error?.message || error
    );
  }

  await db.query("CREATE INDEX IF NOT EXISTS idx_conges_matricule ON conges (matricule)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_conges_matricule_admin ON conges (matricule_admin)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_conges_type_conge ON conges (type_conge_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_conges_dates ON conges (date_debut, date_fin)");
  await ensureAdminMatriculeConstraints("conges", db).catch(() => null);

  try {
    const { rows } = await db.query(
      `SELECT 1
       FROM information_schema.tables
       WHERE table_schema='public' AND table_name = 'utilisateur'
       LIMIT 1`
    );
    const hasUtilisateur = rows.length > 0;
    if (!hasUtilisateur) return { table: "conges" };

    const fkName = "conges_matricule_utilisateur_fkey";

    const existingFks = await listForeignKeysForColumn("conges", "matricule", db);
    const utilisateurFks = existingFks.filter(
      (row) => row.foreign_table_name === "utilisateur" && row.foreign_column_name === "matricule"
    );

    if (utilisateurFks.length > 0) {
      if (utilisateurFks.length > 1 && utilisateurFks.some((r) => r.constraint_name === fkName)) {
        await db.query(`ALTER TABLE conges DROP CONSTRAINT ${fkName}`);
      }
      return { table: "conges" };
    }

    const canReference = await hasUniqueOrPrimaryKeyOnColumn("utilisateur", "matricule", db);
    if (!canReference) {
      return { table: "conges" };
    }

    const exists = await hasConstraint("conges", fkName, db);
    if (exists) return { table: "conges" };

    const hasOrphans = await hasOrphanMatricules(db);
    if (hasOrphans) {
      return { table: "conges" };
    }

    await db.query(
      `ALTER TABLE conges
       ADD CONSTRAINT ${fkName}
       FOREIGN KEY (matricule)
       REFERENCES utilisateur(matricule)
       ON UPDATE CASCADE
       ON DELETE RESTRICT`
    );
  } catch (error) {
    console.warn("ensureCongeStore: matricule FK skipped:", error?.message || error);
  }

  return { table: "conges" };
};
//hedhy eli ta3mel annuler auto ba3ed ma yfout date debut mte3haaaaaa
const expirePendingConges = async (isoDate, db = pool) => {
  await db.query(
    `
      UPDATE conges
      SET statut = 'Refusé', updated_at = NOW()
      WHERE COALESCE(statut, '') ILIKE 'en attente%'
        AND date_debut <= $1
    `,
    [isoDate]
  );
};

const fetchApprovedCongesForYear = async ({ matricule, year, excludeCongeId = null }, db = pool) => {
  const params = [matricule, `${year}-01-01`, `${year}-12-31`];
  const where = [
    "matricule = $1",
    "COALESCE(statut, '') ILIKE 'approuv%'",
    "date_fin >= $2",
    "date_debut <= $3",
  ];

  if (excludeCongeId) {
    params.push(excludeCongeId);
    where.push(`id_conge <> $${params.length}`);
  }

  const typesStore = await getTypesCongeStore(db).catch(() => null);

  const select = ["c.date_debut", "c.date_fin", "c.raison AS raison"];
  let joins = "";
  if (typesStore) {
    joins = `LEFT JOIN ${typesStore.table} tc ON tc.${typesStore.idCol} = c.type_conge_id`;
    select.push(`COALESCE(tc.${typesStore.labelCol}, '') AS type_conge_label`);
  } else {
    select.push("'' AS type_conge_label");
  }

  const query = `
    SELECT ${select.join(", ")}
    FROM conges c
    ${joins}
    WHERE ${where.join(" AND ")}
  `;
  const { rows } = await db.query(query, params);
  return rows;
};
//tjib les conges eli fel bd el personnel mou3ayen
const fetchConges = async (matricule = null, db = pool) => {
  const params = [];
  const where = [];
  const typesStore = await getTypesCongeStore(db).catch(() => null);

  if (matricule) {
    params.push(matricule);
    where.push(`c.matricule = $${params.length}`);
  }

  const select = [
    "c.id_conge",
    "c.matricule",
    "CASE WHEN COALESCE(c.statut, '') ILIKE 'en attente%' THEN NULL ELSE c.matricule_admin END AS matricule_admin",
    "c.type_conge_id",
    "c.date_debut",
    "c.date_fin",
    "c.raison AS raison",
    "c.statut",
    "c.created_at",
    "c.updated_at",
  ];
  let joins = "";

  if (typesStore) {
    joins = `LEFT JOIN ${typesStore.table} tc ON tc.${typesStore.idCol} = c.type_conge_id`;
    select.push(`COALESCE(tc.${typesStore.labelCol}, '') AS type_conge_label`);
  } else {
    select.push("'' AS type_conge_label");
  }

  const query = `
    SELECT ${select.join(", ")}
    FROM conges c
    ${joins}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY c.date_debut DESC, c.id_conge DESC
  `;

  const { rows } = await db.query(query, params);
  return rows;
};
//bsh lpersonnel ma yab3thesh zouz congiyet fard wa9et
const checkCongeOverlap = async (matricule, startIso, endIso, excludeId = null, db = pool) => {
  const query = `
    SELECT 1
    FROM conges
    WHERE matricule = $1
      ${excludeId ? "AND id_conge <> $4" : ""}
      AND COALESCE(statut, '') NOT ILIKE 'annul%'
      AND date_debut <= $3
      AND date_fin >= $2
    LIMIT 1
  `;
  const params = excludeId ? [matricule, startIso, endIso, excludeId] : [matricule, startIso, endIso];
  const { rowCount } = await db.query(query, params);
  return rowCount > 0;
};

// Vérifie spécifiquement si l'personnel a un congé approuvé sur cette période
const checkApprovedCongeOverlap = async (matricule, startIso, endIso, db = pool) => {
  const query = `
    SELECT 1 FROM conges
    WHERE matricule = $1
      AND COALESCE(statut, '') ILIKE 'approuv%'
      AND date_debut <= $3
      AND date_fin >= $2
    LIMIT 1
  `;
  const { rowCount } = await db.query(query, [matricule, startIso, endIso]);
  return rowCount > 0;
};

const insertConge = async (matricule, typeId, startIso, endIso, raison, status, adminMatricule = null, db = pool) => {
  const cols = await getTableColumns("conges", db).catch(() => new Set());
  const insertCols = ["matricule", "type_conge_id", "date_debut", "date_fin", "raison", "statut"];
  const params = [matricule, typeId, startIso, endIso, raison, status];
  if (cols.has("matricule_admin")) {
    insertCols.push("matricule_admin");
    params.push(adminMatricule || null);
  }
  const placeholders = params.map((_, idx) => `$${idx + 1}`).join(", ");
  const insert = `INSERT INTO conges (${insertCols.join(", ")}) VALUES (${placeholders}) RETURNING *`;
  const { rows } = await db.query(insert, params);
  return rows[0];
};

const getCongeById = async (id, db = pool) => {
  const typesStore = await getTypesCongeStore(db).catch(() => null);
  const select = [
    "c.id_conge",
    "c.matricule",
    "CASE WHEN COALESCE(c.statut, '') ILIKE 'en attente%' THEN NULL ELSE c.matricule_admin END AS matricule_admin",
    "c.type_conge_id",
    "c.date_debut",
    "c.date_fin",
    "c.raison AS raison",
    "c.statut",
  ];
  let joins = "";
  if (typesStore) {
    joins = `LEFT JOIN ${typesStore.table} tc ON tc.${typesStore.idCol} = c.type_conge_id`;
    select.push(`COALESCE(tc.${typesStore.labelCol}, '') AS type_conge_label`);
  } else {
    select.push("'' AS type_conge_label");
  }

  const { rows } = await db.query(`SELECT ${select.join(", ")} FROM conges c ${joins} WHERE c.id_conge = $1 LIMIT 1`, [id]);
  return rows[0];
};

const updateCongeData = async (id, matricule, typeId, startIso, endIso, raison, adminMatricule = null, db = pool) => {
  const cols = await getTableColumns("conges", db).catch(() => new Set());
  const params = [matricule, typeId, startIso, endIso, raison];
  const setParts = [
    "matricule = $1",
    "type_conge_id = $2",
    "date_debut = $3",
    "date_fin = $4",
    "raison = $5",
    "updated_at = NOW()",
  ];
  if (cols.has("matricule_admin") && adminMatricule) {
    params.push(adminMatricule);
    setParts.push(`matricule_admin = $${params.length}`);
  }
  params.push(id);
  const update = `
    UPDATE conges
    SET ${setParts.join(", ")}
    WHERE id_conge = $${params.length}
    RETURNING *
  `;
  const { rows } = await db.query(update, params);
  return rows[0];
};

const updateCongeStatusDB = async (id, status, adminMatricule = null, db = pool) => {
  const cols = await getTableColumns("conges", db).catch(() => new Set());
  const params = [status];
  const setParts = ["statut = $1", "updated_at = NOW()"];
  if (cols.has("matricule_admin") && adminMatricule) {
    params.push(adminMatricule);
    setParts.push(`matricule_admin = $${params.length}`);
  }
  params.push(id);
  const update = `UPDATE conges SET ${setParts.join(", ")} WHERE id_conge = $${params.length} RETURNING *`;
  const { rows } = await db.query(update, params);
  return rows[0];
};

const updateCongeStatusAndEndDB = async (id, status, endIso, adminMatricule = null, db = pool) => {
  const cols = await getTableColumns("conges", db).catch(() => new Set());
  const params = [status, endIso];
  const setParts = ["statut = $1", "date_fin = $2", "updated_at = NOW()"];
  if (cols.has("matricule_admin") && adminMatricule) {
    params.push(adminMatricule);
    setParts.push(`matricule_admin = $${params.length}`);
  }
  params.push(id);
  const update = `UPDATE conges SET ${setParts.join(", ")} WHERE id_conge = $${params.length} RETURNING *`;
  const { rows } = await db.query(update, params);
  return rows[0];
};
//liste mta3 l'admin
const fetchCongesAdmin = async (db = pool) => {
  const userCols = await getUtilisateurColumns(db).catch(() => []);
  const hasPrenom = userCols.includes("prenom");
  const hasNom = userCols.includes("nom");
  const hasServiceText = userCols.includes("service");
  const hasIdService = userCols.includes("id_service");
  const hasIdGrade = userCols.includes("id_grade");
  const hasLegacyGrade = userCols.includes("grade");

  const serviceStore = hasIdService ? await getServiceStore(db).catch(() => null) : null;
  const hasServiceTable = Boolean(serviceStore);
  const gradeStore = hasIdGrade ? await getGradeStore(db).catch(() => null) : null;
  const typesStore = await getTypesCongeStore(db).catch(() => null);

  const select = [
    "c.id_conge",
    "c.matricule",
    "CASE WHEN COALESCE(c.statut, '') ILIKE 'en attente%' THEN NULL ELSE c.matricule_admin END AS matricule_admin",
    "c.type_conge_id",
    "c.date_debut",
    "c.date_fin",
    "c.raison AS raison",
    "c.statut",
    "c.created_at",
    "c.updated_at",
  ];

  let joins = "";

  if (typesStore) {
    joins += ` LEFT JOIN ${typesStore.table} tc ON tc.${typesStore.idCol} = c.type_conge_id`;
    select.push(`COALESCE(tc.${typesStore.labelCol}, '') AS type_conge_label`);
  } else {
    select.push("'' AS type_conge_label");
  }

  if (hasPrenom || hasNom || hasServiceText || hasIdService || hasIdGrade || hasLegacyGrade) {
    joins += " LEFT JOIN utilisateur u ON u.matricule = c.matricule";
    if (hasPrenom) select.push("COALESCE(u.prenom, '') AS prenom");
    if (hasNom) select.push("COALESCE(u.nom, '') AS nom");
    if (hasServiceText) select.push("COALESCE(u.service, '') AS service_text");
    if (hasIdService && hasServiceTable) {
      joins += ` LEFT JOIN ${serviceStore.table} s ON u.id_service = s.${serviceStore.idCol}`;
      select.push(`COALESCE(s.${serviceStore.nameCol}, '') AS service_text`);
      select.push("u.id_service");
    } else if (hasIdService) {
      select.push("u.id_service");
    } else {
      select.push("NULL::int AS id_service");
    }

    if (hasIdGrade) {
      select.push("COALESCE(u.id_grade::text, '') AS id_grade");
    } else {
      select.push("'' AS id_grade");
    }

    if (gradeStore && hasIdGrade) {
      joins += ` LEFT JOIN ${gradeStore.table} g ON g.${gradeStore.idCol} = u.id_grade`;
      select.push(`COALESCE(g.${gradeStore.labelCol}, '') AS grade`);
    } else if (hasLegacyGrade) {
      select.push("COALESCE(u.grade, '') AS grade");
    } else {
      select.push("'' AS grade");
    }
  } else {
    select.push(
      "'' AS prenom",
      "'' AS nom",
      "'' AS service_text",
      "NULL::int AS id_service",
      "'' AS id_grade",
      "'' AS grade"
    );
  }

  const query = `
    SELECT ${select.join(", ")}
    FROM conges c
    ${joins}
    ORDER BY c.date_debut DESC, c.id_conge DESC
  `;

  const { rows } = await db.query(query);

  if (hasServiceTable) {
    for (const row of rows) {
      if (!row.service_text && row.id_service) {
        const name = await resolveServiceNameById(row.id_service, db).catch(() => "");
        row.service_text = name || "";
      }
    }
  }

  return rows;
};

module.exports = {
  getCongeStore,
  ensureCongeStore,
  expirePendingConges,
  fetchApprovedCongesForYear,
  fetchConges,
  checkCongeOverlap,
  checkApprovedCongeOverlap,
  insertConge,
  getCongeById,
  updateCongeData,
  updateCongeStatusDB,
  updateCongeStatusAndEndDB,
  fetchCongesAdmin,
};