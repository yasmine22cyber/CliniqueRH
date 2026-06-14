const pool = require("../config/db");

const ALLOWED_SHIFT_TYPES = Object.freeze(["Matin", "Apres-midi", "Garde"]);

const ensureTypeShiftStore = async (db = pool) => {
  const table = "type_shift";
  await db.query(
    `CREATE TABLE IF NOT EXISTS ${table} (
      id SERIAL PRIMARY KEY,
      type_shift VARCHAR(40) NOT NULL UNIQUE,
      nb_heures NUMERIC(8,2) NOT NULL CHECK (nb_heures >= 0),
      coefficient NUMERIC(8,3) NOT NULL DEFAULT 1.0 CHECK (coefficient >= 0)
    )`
  );

  try {
    const { getTableColumns } = require("./dbUtils");
    const cols = await getTableColumns(table, db).catch(() => new Set());
    if (cols.size > 0 && !cols.has("coefficient")) {
      await db.query(`ALTER TABLE ${table} ADD COLUMN coefficient NUMERIC(8,3) NOT NULL DEFAULT 1.0`);
    }
  } catch (e) {
    console.warn("ensureTypeShiftStore: migration failed", e);
  }

  await db.query(
    `INSERT INTO ${table} (type_shift, nb_heures, coefficient)
     VALUES
       ('Matin', 7, 1.5),
       ('Apres-midi', 5, 1.5),
       ('Garde', 12, 2.0)
     ON CONFLICT (type_shift) DO NOTHING`
  );

  return { table };
};

const listTypeShift = async (db = pool) => {
  await ensureTypeShiftStore(db);
  const { rows } = await db.query(
    `SELECT id, type_shift, nb_heures, coefficient
     FROM type_shift
     WHERE type_shift = ANY($1::text[])
     ORDER BY id ASC`,
    [ALLOWED_SHIFT_TYPES]
  );
  return rows;
};

module.exports = {
  ensureTypeShiftStore,
  ALLOWED_SHIFT_TYPES,
  listTypeShift,
};