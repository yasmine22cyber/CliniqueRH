const pool = require("../config/db");

const normalizeCategory = (value, fallback = "medecin") => {
  const lower = String(value ?? "").trim().toLowerCase();
  return lower || fallback;
};

// À utiliser uniquement lorsque le tableau ne comporte pas de colonne « catégorie »
const inferCategoryFromLabel = (label = "") => {
  const lower = String(label || "").trim().toLowerCase();
  if (lower.includes("inf")) return "infirmier";
  if (lower.includes("sage") || lower.includes("kin") || lower.includes("labor") || lower.includes("para")) {
    return "paramedical";
  }
  return "medecin";
};

const getGradeStore = async (db = pool) => {
  const { rows } = await db.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema='public' AND table_name IN ('grade', 'grades')`
  );
  const names = rows.map((r) => r.table_name);
  if (names.includes("grade")) {
    return {
      table: "grade",
      idCol: "id_grade",
      labelCol: "type_de_grade",
      salaireCol: "salaire",
      categoryCol: "categorie",
    };
  }
  if (names.includes("grades")) {
    return {
      table: "grades",
      idCol: "id",
      labelCol: "label",
      salaireCol: "salaire",
      categoryCol: "categorie",
    };
  }
  return null;
};

const getGradeColumns = async (tableName, db = pool) => {
  const { rows } = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1`,
    [tableName]
  );
  return new Set(rows.map((r) => r.column_name));
};

const fetchGrades = async (categorie = null, db = pool) => {
  const store = await getGradeStore(db);
  if (!store) return [];

  const cols = await getGradeColumns(store.table, db);
  const select = [`${store.idCol} AS id_grade`, `${store.labelCol} AS type_de_grade`];
  if (cols.has(store.salaireCol)) select.push(`${store.salaireCol} AS salaire`);
  const hasCategory = cols.has(store.categoryCol);
  if (hasCategory) select.push(`${store.categoryCol} AS categorie`);

  const params = [];
  let where = "";
  if (categorie && hasCategory) {
    params.push(categorie);
    where = `WHERE LOWER(TRIM(${store.categoryCol})) = LOWER(TRIM($1))`;
  }

  const { rows } = await db.query(
    `SELECT ${select.join(", ")}
     FROM ${store.table}
     ${where}
     ORDER BY ${store.labelCol} ASC`,
    params
  );

  return rows.map((r) => {
    const categoryRaw = hasCategory ? r.categorie : null;
    const resolvedCategory = categoryRaw ? normalizeCategory(categoryRaw) : inferCategoryFromLabel(r.type_de_grade);
    return {
      id_grade: Number(r.id_grade) || null,
      type_de_grade: r.type_de_grade,
      salaire: r.salaire ?? null,
      categorie: resolvedCategory,
    };
  });
};

const findGradeById = async (id, db = pool) => {
  if (!id) return null;
  const store = await getGradeStore(db);
  if (!store) return null;

  const cols = await getGradeColumns(store.table, db);
  const hasCategory = cols.has(store.categoryCol);
  const select = [`${store.idCol} AS id_grade`, `${store.labelCol} AS type_de_grade`];
  if (cols.has(store.salaireCol)) select.push(`${store.salaireCol} AS salaire`);
  if (hasCategory) select.push(`${store.categoryCol} AS categorie`);

  const { rows } = await db.query(
    `SELECT ${select.join(", ")}
     FROM ${store.table}
     WHERE ${store.idCol} = $1
     LIMIT 1`,
    [id]
  );
  if (!rows.length) return null;

  const row = rows[0];
  const resolvedCategory = hasCategory
    ? normalizeCategory(row.categorie)
    : inferCategoryFromLabel(row.type_de_grade);
  return {
    id_grade: Number(row.id_grade) || null,
    type_de_grade: row.type_de_grade,
    salaire: row.salaire ?? null,
    categorie: resolvedCategory,
  };
};

const findGradeByLabel = async (label, db = pool) => {
  const safeLabel = String(label ?? "").trim();
  if (!safeLabel) return null;

  const store = await getGradeStore(db);
  if (!store) return null;

  const cols = await getGradeColumns(store.table, db);
  const hasCategory = cols.has(store.categoryCol);
  const select = [`${store.idCol} AS id_grade`, `${store.labelCol} AS type_de_grade`];
  if (cols.has(store.salaireCol)) select.push(`${store.salaireCol} AS salaire`);
  if (hasCategory) select.push(`${store.categoryCol} AS categorie`);

// Si plusieurs lignes partagent la même étiquette (exp:Stagiaire dans plusieurs catégories),
// cette fonction renvoie par défaut l’identifiant le plus bas. Il est préférable de fournir l’identifiant_grade via l’interface utilisateur.
  const { rows } = await db.query(
    `SELECT ${select.join(", ")}
     FROM ${store.table}
     WHERE LOWER(TRIM(${store.labelCol})) = LOWER(TRIM($1))
     ORDER BY ${store.idCol} ASC
     LIMIT 1`,
    [safeLabel]
  );
  if (!rows.length) return null;

  const row = rows[0];
  const resolvedCategory = hasCategory
    ? normalizeCategory(row.categorie)
    : inferCategoryFromLabel(row.type_de_grade);
  return {
    id_grade: Number(row.id_grade) || null,
    type_de_grade: row.type_de_grade,
    salaire: row.salaire ?? null,
    categorie: resolvedCategory,
  };
};
//les service limsakrinn hassib grade mo3ayann et chkonn mamno3 yikhdem fililll 
const getGradeRestrictionKeys = async (_db = pool) => ({
  night_restricted: [],
  service_locked: [],
});

module.exports = {
  getGradeStore,
  getGradeColumns,
  fetchGrades,
  findGradeById,
  findGradeByLabel,
  normalizeCategory,
  getGradeRestrictionKeys,
};