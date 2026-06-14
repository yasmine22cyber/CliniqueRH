const pool = require("../config/db");
const getUtilisateurColumns = async (db = pool) => {
  const { rows } = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'utilisateur'`
  );
  return rows.map((r) => r.column_name);
};

// les colonnes de ayy table
const getTableColumns = async (tableName, db = pool) => {
  const { rows } = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1`,
    [tableName]
  );
  return new Set(rows.map((r) => r.column_name));
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

const ensureAdminMatriculeConstraints = async (table, db = pool) => {
  if (!table) return;

  const tableCols = await getTableColumns(table, db).catch(() => new Set());
  if (!tableCols.has("matricule_admin")) return;

  const userCols = await getTableColumns("utilisateur", db).catch(() => new Set());
  if (!userCols.size || !userCols.has("matricule") || !userCols.has("role")) return;

  try {
    const fkName = `${table}_matricule_admin_utilisateur_fkey`;
    const existingFks = await listForeignKeysForColumn(table, "matricule_admin", db);
    const hasUtilisateurFk = existingFks.some(
      (row) => row.foreign_table_name === "utilisateur" && row.foreign_column_name === "matricule"
    );

    if (!hasUtilisateurFk) {
      const canReference = await hasUniqueOrPrimaryKeyOnColumn("utilisateur", "matricule", db);
      const existsByName = await hasConstraint(table, fkName, db);
      if (!existsByName && canReference) {
        await db.query(
          `ALTER TABLE ${table}
           ADD CONSTRAINT ${fkName}
           FOREIGN KEY (matricule_admin)
           REFERENCES utilisateur(matricule)
           ON UPDATE CASCADE
           ON DELETE RESTRICT`
        );
      }
    }
  } catch (error) {
    console.warn(`ensureAdminMatriculeConstraints(${table}): FK skipped:`, error?.message || error);
  }

  try {
    await db.query(`
      CREATE OR REPLACE FUNCTION public.enforce_admin_matricule_role()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.matricule_admin IS NULL OR BTRIM(NEW.matricule_admin) = '' THEN
          RETURN NEW;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM utilisateur u
          WHERE u.matricule = NEW.matricule_admin
            AND LOWER(COALESCE(u.role, '')) LIKE '%admin%'
        ) THEN
          RAISE EXCEPTION 'matricule_admin (%) doit appartenir a un utilisateur admin.', NEW.matricule_admin
            USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
      END;
      $$;
    `);

    const triggerName = `${table}_admin_matricule_role_check_trg`;
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname = '${table}'
            AND t.tgname = '${triggerName}'
            AND NOT t.tgisinternal
        ) THEN
          CREATE TRIGGER ${triggerName}
          BEFORE INSERT OR UPDATE OF matricule_admin
          ON ${table}
          FOR EACH ROW
          EXECUTE FUNCTION public.enforce_admin_matricule_role();
        END IF;
      EXCEPTION
        WHEN duplicate_object THEN
          -- Another concurrent request created it first.
          NULL;
      END
      $$;
    `);
  } catch (error) {
    const msg = (error?.message || "").toString().toLowerCase();
    if (msg.includes("tuple concurrently updated") || msg.includes("duplicate")) return;
    console.warn(`ensureAdminMatriculeConstraints(${table}): trigger skipped:`, error?.message || error);
  }
};

module.exports = { getUtilisateurColumns, getTableColumns, ensureAdminMatriculeConstraints };