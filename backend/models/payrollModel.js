const pool = require("../config/db");
const typeShiftModel = require("./typeShiftModel");
const { getTableColumns } = require("./dbUtils");

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
     FROM ${table} x
     LEFT JOIN utilisateur u ON u.matricule = x.matricule
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
    //kan deja fama fk fil table donc nfas5o dublication (3la hasiib utilisateurfks choch iraj3ilna)
    if (utilisateurFks.length > 0) {
      if (utilisateurFks.length > 1 && utilisateurFks.some((r) => r.constraint_name === fkName)) {
        await db.query(`ALTER TABLE ${table} DROP CONSTRAINT ${fkName}`);
      }
      return;
    }
   
    const canReference = await hasUniqueOrPrimaryKeyOnColumn("utilisateur", "matricule", db);
    if (!canReference) {
      console.warn(`ensurePayrollStore: utilisateur.matricule is not UNIQUE/PK; skipping FK creation for ${table}.`);
      return;
    }

    const exists = await hasConstraint(table, fkName, db);
    if (exists) return;

    const hasOrphans = await hasOrphanMatricules(table, db);
    if (hasOrphans) {
      console.warn(`ensurePayrollStore: orphan ${table}.matricule found; skipping FK creation.`);
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
    console.warn("ensurePayrollStore: matricule FK skipped:", error?.message || error);
  }
};


const ensureFichePaieStore = async (db = pool) => {
  const table = "fiche_paie";
  await db.query(
    `CREATE TABLE IF NOT EXISTS ${table} (
      id SERIAL PRIMARY KEY,
      matricule VARCHAR(10) NOT NULL,
      mois INTEGER NOT NULL CHECK (mois >= 1 AND mois <= 12),
      annee INTEGER NOT NULL CHECK (annee >= 1900 AND annee <= 2200),
      total_heures_prevues NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_heures_reelles NUMERIC(12,2) NOT NULL DEFAULT 0,
      heures_manquantes NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_heures_supp NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_gain_supp NUMERIC(14,3) NOT NULL DEFAULT 0,
      deductions NUMERIC(14,3) NOT NULL DEFAULT 0,
      total_deductions NUMERIC(14,3) NOT NULL DEFAULT 0,
      taux_horaire NUMERIC(14,6) NOT NULL DEFAULT 0,
      salaire_base NUMERIC(14,3) NULL,
      salaire_net NUMERIC(14,3) NOT NULL DEFAULT 0,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (matricule, mois, annee)
    )`
  );

  const cols = await getTableColumns(table, db).catch(() => new Set());
  if (!cols.has("total_heures_prevues")) {
    await db.query(`ALTER TABLE ${table} ADD COLUMN total_heures_prevues NUMERIC(12,2) NOT NULL DEFAULT 0`);
  }
  if (!cols.has("total_heures_reelles")) {
    await db.query(`ALTER TABLE ${table} ADD COLUMN total_heures_reelles NUMERIC(12,2) NOT NULL DEFAULT 0`);
  }
  if (!cols.has("heures_manquantes")) {
    await db.query(`ALTER TABLE ${table} ADD COLUMN heures_manquantes NUMERIC(12,2) NOT NULL DEFAULT 0`);
  }
  if (!cols.has("total_deductions")) {
    await db.query(`ALTER TABLE ${table} ADD COLUMN total_deductions NUMERIC(14,3) NOT NULL DEFAULT 0`);
    await db.query(`UPDATE ${table} SET total_deductions = deductions WHERE total_deductions = 0`);
  }
  if (!cols.has("taux_horaire")) {
    await db.query(`ALTER TABLE ${table} ADD COLUMN taux_horaire NUMERIC(14,6) NOT NULL DEFAULT 0`);
  }

  await db.query(`CREATE INDEX IF NOT EXISTS idx_${table}_matricule_month ON ${table} (matricule, annee DESC, mois DESC)`);
  await ensureMatriculeFkToUtilisateur(table, db);
  return { table };
};

const ensurePayrollStores = async (db = pool) => {
  await typeShiftModel.ensureTypeShiftStore(db);
  await ensureFichePaieStore(db);
  return true;
};



const getFichePaieRow = async ({ matricule, mois, annee }, db = pool) => {
  const store = await ensureFichePaieStore(db);
  const { rows } = await db.query(
    `SELECT *
     FROM ${store.table}
     WHERE matricule = $1 AND mois = $2 AND annee = $3
     LIMIT 1`,
    [matricule, mois, annee]
  );
  return rows[0] || null;
};
//ta3mel update ken lfiche de paie mawjouda snn tzidha
const upsertFichePaie = async (
  {
    matricule,
    mois,
    annee,
    totalHeuresPrevues = 0,
    totalHeuresReelles = 0,
    heuresManquantes = 0,
    totalHeuresSupp,
    totalGainSupp,
    deductions,
    tauxHoraire = 0,
    salaireBase,
    salaireNet,
  },
  db = pool
) => {
  const store = await ensureFichePaieStore(db);
  const { rows } = await db.query(
    `INSERT INTO ${store.table} (
      matricule,
      mois,
      annee,
      total_heures_prevues,
      total_heures_reelles,
      heures_manquantes,
      total_heures_supp,
      total_gain_supp,
      deductions,
      total_deductions,
      taux_horaire,
      salaire_base,
      salaire_net,
      generated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
    ON CONFLICT (matricule, mois, annee)
    DO UPDATE SET
      total_heures_prevues = EXCLUDED.total_heures_prevues,
      total_heures_reelles = EXCLUDED.total_heures_reelles,
      heures_manquantes = EXCLUDED.heures_manquantes,
      total_heures_supp = EXCLUDED.total_heures_supp,
      total_gain_supp = EXCLUDED.total_gain_supp,
      deductions = EXCLUDED.deductions,
      total_deductions = EXCLUDED.total_deductions,
      taux_horaire = EXCLUDED.taux_horaire,
      salaire_base = EXCLUDED.salaire_base,
      salaire_net = EXCLUDED.salaire_net,
      generated_at = NOW()
    RETURNING *`,
    [
      matricule,
      mois,
      annee,
      totalHeuresPrevues,
      totalHeuresReelles,
      heuresManquantes,
      totalHeuresSupp,
      totalGainSupp,
      deductions,
      deductions,
      tauxHoraire,
      salaireBase,
      salaireNet,
    ]
  );
  return rows[0] || null;
};

module.exports = {
  ensurePayrollStores,
  getFichePaieRow,
  upsertFichePaie,
  listTypeShift: typeShiftModel.listTypeShift,
};