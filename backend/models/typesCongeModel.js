const pool = require("../config/db");

const TABLE_CANDIDATES = Object.freeze(["types_conge", "type_conge", "types_conges"]);
const ID_CANDIDATES = Object.freeze([
  "id_type_conge",
  "id_type",
  "type_conge_id",
  "id",
  "id_types_conge",
]);
const LABEL_CANDIDATES = Object.freeze([
  "libelle",
  "label",
  "nom",
  "type",
  "designation",
  "intitule",
  "name",
  "title",
]);

const getExistingTypeCongeTable = async (db = pool) => {
  const { rows } = await db.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema='public' AND table_name = ANY($1::text[])`,
    [TABLE_CANDIDATES]
  );
  const names = rows.map((r) => r.table_name);
  for (const candidate of TABLE_CANDIDATES) {
    if (names.includes(candidate)) return candidate;
  }
  return null;
};

const getColumns = async (tableName, db = pool) => {
  const { rows } = await db.query(
    `SELECT column_name, data_type, udt_name, ordinal_position
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name = $1
     ORDER BY ordinal_position ASC`,
    [tableName]
  );
  return rows;
};

const getPrimaryKeyColumn = async (tableName, db = pool) => {
  const { rows } = await db.query(
    `
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema='public'
      AND tc.table_name = $1
      AND tc.constraint_type='PRIMARY KEY'
    ORDER BY kcu.ordinal_position ASC
    LIMIT 1
    `,
    [tableName]
  );
  return rows[0]?.column_name || null;
};

const isTextType = (dataType = "", udtName = "") => {
  const dt = String(dataType || "").toLowerCase();
  const udt = String(udtName || "").toLowerCase();
  return dt.includes("character") || dt === "text" || udt === "varchar" || udt === "bpchar";
};

const chooseIdCol = ({ pkCol, columns }) => {
  const colNames = new Set(columns.map((c) => c.column_name));
  for (const candidate of ID_CANDIDATES) {
    if (colNames.has(candidate)) return candidate;
  }
  return pkCol && colNames.has(pkCol) ? pkCol : null;
};

const chooseLabelCol = ({ idCol, columns }) => {
  const colNames = new Set(columns.map((c) => c.column_name));
  for (const candidate of LABEL_CANDIDATES) {
    if (colNames.has(candidate)) return candidate;
  }
  const firstText = columns.find((c) => c.column_name !== idCol && isTextType(c.data_type, c.udt_name));
  return firstText?.column_name || null;
};

const getTypesCongeStore = async (db = pool) => {
  const table = await getExistingTypeCongeTable(db);
  if (!table) return null;

  const columns = await getColumns(table, db);
  if (!columns.length) return null;

  const pkCol = await getPrimaryKeyColumn(table, db).catch(() => null);
  const idCol = chooseIdCol({ pkCol, columns });
  const labelCol = chooseLabelCol({ idCol, columns });

  if (!idCol || !labelCol) return null;
  return { table, idCol, labelCol };
};

const listTypesConge = async (db = pool) => {
  const store = await getTypesCongeStore(db);
  if (!store) return [];
  const query = `
    SELECT ${store.idCol} AS id, ${store.labelCol} AS label
    FROM ${store.table}
    ORDER BY ${store.labelCol} ASC
  `;
  const { rows } = await db.query(query);
  return rows.map((r) => ({ id: r.id, label: String(r.label ?? "").trim() }));
};

const resolveTypeCongeIdByLabel = async (label, db = pool) => {
  const store = await getTypesCongeStore(db);
  if (!store) return null;
  const text = String(label || "").trim();
  if (!text) return null;
  const { rows } = await db.query(
    `
    SELECT ${store.idCol} AS id
    FROM ${store.table}
    WHERE LOWER(TRIM(${store.labelCol})) = LOWER(TRIM($1))
    LIMIT 1
    `,
    [text]
  );
  return rows[0]?.id ?? null;
};

module.exports = {
  getTypesCongeStore,
  listTypesConge,
  resolveTypeCongeIdByLabel,
};