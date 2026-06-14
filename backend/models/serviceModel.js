const pool = require("../config/db");
const {
  getUtilisateurColumns,
  getTableColumns: getDbTableColumns,
  ensureAdminMatriculeConstraints,
} = require("./dbUtils");
const { getGradeStore } = require("./gradeModel");

const getServiceStore = async (db = pool) => {
  const { rows } = await db.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema='public' AND table_name IN ('service', 'services')`
  );
  const names = rows.map((r) => r.table_name);
  if (names.includes("service")) {
    return { table: "service", idCol: "id_service", nameCol: "nom_service" };
  }
  if (names.includes("services")) {
    return { table: "services", idCol: "id", nameCol: "nom" };
  }
  return null;
};

const getTableColumns = (tableName, db = pool) => getDbTableColumns(tableName, db);

const hasCol = (cols, col) => {
  if (!cols) return false;
  if (cols instanceof Set) return cols.has(col);
  if (Array.isArray(cols)) return cols.includes(col);
  return false;
};

const normalizeLoose = (value) =>
  `${value ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const resolveServiceId = async (serviceValue, db = pool) => {
  if (serviceValue === undefined || serviceValue === null || serviceValue === "") return null;
  const store = await getServiceStore(db);
  if (!store) return null;

  const numeric = Number(serviceValue);
  if (!Number.isNaN(numeric)) return numeric;

  const rawName = String(serviceValue);
  const { rows } = await db.query(
    `SELECT ${store.idCol} AS id
     FROM ${store.table}
     WHERE LOWER(TRIM(${store.nameCol})) = LOWER(TRIM($1))
     LIMIT 1`,
    [rawName]
  );
  if (rows[0]?.id !== undefined && rows[0]?.id !== null) return rows[0].id;

  const allRows = await db.query(
    `SELECT ${store.idCol} AS id, ${store.nameCol} AS name FROM ${store.table}`
  );
  const targetNormalized = normalizeLoose(rawName);
  const matched = allRows.rows.find((row) => normalizeLoose(row.name) === targetNormalized);
  return matched?.id ?? null;
};

const resolveServiceNameById = async (serviceId, db = pool) => {
  if (!serviceId) return null;
  const store = await getServiceStore(db);
  if (!store) return null;
  const { rows } = await db.query(
    `SELECT ${store.nameCol} AS name FROM ${store.table} WHERE ${store.idCol} = $1 LIMIT 1`,
    [serviceId]
  );
  return rows[0]?.name || null;
};

const buildGradeSqlContext = async (userCols, userAlias = "u", gradeAlias = "g", db = pool) => {
  const hasIdGrade = hasCol(userCols, "id_grade");
  const hasLegacyGrade = hasCol(userCols, "grade");

  if (!hasIdGrade) {
    return {
      joinClause: "",
      labelExpr: hasLegacyGrade ? `COALESCE(${userAlias}.grade, '')` : "''",
      chefFilterExpr: hasLegacyGrade
        ? `LOWER(COALESCE(${userAlias}.grade, '')) LIKE '%chef de service%'`
        : "FALSE",
    };
  }

  const gradeStore = await getGradeStore(db).catch(() => null);
  if (!gradeStore) {
    return {
      joinClause: "",
      labelExpr: hasLegacyGrade ? `COALESCE(${userAlias}.grade, '')` : "''",
      chefFilterExpr: hasLegacyGrade
        ? `LOWER(COALESCE(${userAlias}.grade, '')) LIKE '%chef de service%'`
        : "FALSE",
    };
  }

  return {
    joinClause: `LEFT JOIN ${gradeStore.table} ${gradeAlias} ON ${gradeAlias}.${gradeStore.idCol} = ${userAlias}.id_grade`,
    labelExpr: `COALESCE(${gradeAlias}.${gradeStore.labelCol}, '')`,
    chefFilterExpr: `LOWER(COALESCE(${gradeAlias}.${gradeStore.labelCol}, '')) LIKE '%chef de service%'`,
  };
};

const serviceExists = async (store, nom, excludeId = null, db = pool) => {
  const colExpr = `LOWER(REGEXP_REPLACE(TRIM(COALESCE(${store.nameCol}, '')), '\\s+', ' ', 'g'))`;
  const paramExpr = "LOWER(REGEXP_REPLACE(TRIM(COALESCE($1, '')), '\\s+', ' ', 'g'))";

  const query =
    excludeId === null
      ? `SELECT 1 FROM ${store.table} WHERE ${colExpr}=${paramExpr} LIMIT 1`
      : `SELECT 1 FROM ${store.table} WHERE ${colExpr}=${paramExpr} AND ${store.idCol}<>$2 LIMIT 1`;
  const params = excludeId === null ? [nom] : [nom, excludeId];
  const { rows } = await db.query(query, params);
  return rows.length > 0;
};

const resolveChefName = async (serviceName, db = pool) => {
  const userCols = await getUtilisateurColumns(db);
  const hasUserRole = hasCol(userCols, "role");
  const hasUserService = hasCol(userCols, "service");
  const hasUserServiceId = hasCol(userCols, "id_service");
  const hasUserPrenom = hasCol(userCols, "prenom");
  const hasUserNom = hasCol(userCols, "nom");

  if (!hasUserPrenom || !hasUserNom) return null;

  const gradeSql = await buildGradeSqlContext(userCols, "u", "g", db);
  if (gradeSql.chefFilterExpr === "FALSE") return null;

  const roleClause = hasUserRole ? "AND LOWER(u.role)='personnel'" : "";

  if (hasUserServiceId) {
    const store = await getServiceStore(db);
    if (!store) return null;
    const serviceLookup = await db.query(
      `SELECT ${store.idCol} AS id
       FROM ${store.table}
       WHERE LOWER(TRIM(COALESCE(${store.nameCol}, ''))) = LOWER(TRIM($1))
       LIMIT 1`,
      [serviceName]
    );
    const serviceId = serviceLookup.rows[0]?.id;
    if (serviceId === undefined || serviceId === null) return null;

    const { rows } = await db.query(
      `SELECT TRIM(u.prenom || ' ' || u.nom) AS full_name
       FROM utilisateur u
       ${gradeSql.joinClause}
       WHERE 1=1
         ${roleClause}
         AND u.id_service = $1
         AND ${gradeSql.chefFilterExpr}
       ORDER BY u.nom ASC, u.prenom ASC
       LIMIT 1`,
      [serviceId]
    );
    return rows[0]?.full_name || null;
  }

  if (hasUserService) {
    const { rows } = await db.query(
      `SELECT TRIM(u.prenom || ' ' || u.nom) AS full_name
       FROM utilisateur u
       ${gradeSql.joinClause}
       WHERE 1=1
         ${roleClause}
         AND LOWER(TRIM(COALESCE(u.service, ''))) = LOWER(TRIM($1))
         AND ${gradeSql.chefFilterExpr}
       ORDER BY u.nom ASC, u.prenom ASC
       LIMIT 1`,
      [serviceName]
    );
    return rows[0]?.full_name || null;
  }

  return null;
};

const buildPersonnelServiceFilter = (userCols, serviceId, serviceName, firstParamIndex = 1) => {
  const whereParts = [];
  const params = [];
  let paramIndex = firstParamIndex;

  if (hasCol(userCols, "role")) {
    whereParts.push("LOWER(COALESCE(role, ''))='personnel'");
  }

  const serviceLinkParts = [];
  if (hasCol(userCols, "id_service")) {
    serviceLinkParts.push(`id_service=$${paramIndex}`);
    params.push(serviceId);
    paramIndex += 1;
  }
  if (hasCol(userCols, "service")) {
    serviceLinkParts.push(`LOWER(TRIM(COALESCE(service, ''))) = LOWER(TRIM($${paramIndex}))`);
    params.push(serviceName);
    paramIndex += 1;
  }

  if (!serviceLinkParts.length) {
    return { hasLinks: false, whereClause: "FALSE", params: [] };
  }

  whereParts.push(`(${serviceLinkParts.join(" OR ")})`);
  return { hasLinks: true, whereClause: whereParts.join(" AND "), params };
};

const getAllServices = async (db = pool) => {
  const store = await getServiceStore(db);
  if (!store) return [];
  const cols = await getTableColumns(store.table, db);

  const hasDescription = cols.has("description");
  const hasDescriptionService = cols.has("description_service");
  const hasNumTelService = cols.has("num_tel_service");
  const userCols = await getUtilisateurColumns(db);
  const hasUserRole = hasCol(userCols, "role");
  const hasUserService = hasCol(userCols, "service");
  const hasUserServiceId = hasCol(userCols, "id_service");
  const hasUserPrenom = hasCol(userCols, "prenom");
  const hasUserNom = hasCol(userCols, "nom");
  const hasUserPhone = hasCol(userCols, "num_telephone");
  const gradeSqlForChef = await buildGradeSqlContext(userCols, "u2", "g2", db);

  const countRoleFilter = hasUserRole ? "LOWER(u.role)='personnel' AND" : "";
  const countServiceMatch = hasUserServiceId
    ? `u.id_service = s.${store.idCol}`
    : hasUserService
    ? `LOWER(TRIM(COALESCE(u.service, ''))) = LOWER(TRIM(s.${store.nameCol}))`
    : "FALSE";

  const chefRoleFilter = hasUserRole ? "LOWER(u2.role)='personnel' AND" : "";
  const chefServiceMatch = hasUserServiceId
    ? `u2.id_service = s.${store.idCol}`
    : hasUserService
    ? `LOWER(TRIM(COALESCE(u2.service, ''))) = LOWER(TRIM(s.${store.nameCol}))`
    : "FALSE";
  const chefGradeFilter = gradeSqlForChef.chefFilterExpr;

  const chefPrenomSelect = hasUserPrenom ? "COALESCE(u2.prenom, '') AS prenom" : "''::text AS prenom";
  const chefNomSelect = hasUserNom ? "COALESCE(u2.nom, '') AS nom" : "''::text AS nom";
  const chefPhoneSelect = hasUserPhone ? "COALESCE(u2.num_telephone, '') AS num_telephone" : "''::text AS num_telephone";
  const chefOrderBy = hasUserNom && hasUserPrenom ? "u2.nom ASC, u2.prenom ASC" : hasUserNom ? "u2.nom ASC" : hasUserPrenom ? "u2.prenom ASC" : "u2.matricule ASC";

  const descriptionExpr =
    hasDescription && hasDescriptionService
      ? "COALESCE(s.description, s.description_service, '')"
      : hasDescription
      ? "COALESCE(s.description, '')"
      : hasDescriptionService
      ? "COALESCE(s.description_service, '')"
      : "''";

  const servicePhoneExpr = hasNumTelService ? "COALESCE(s.num_tel_service, '')" : "''";

  const { rows } = await db.query(
    `SELECT
       s.${store.idCol} AS id,
       s.${store.nameCol} AS service,
       ${descriptionExpr} AS description,
       ${servicePhoneExpr} AS service_phone,
       (
         SELECT COALESCE(COUNT(*), 0)::int
         FROM utilisateur u
         WHERE ${countRoleFilter}
           ${countServiceMatch}
       ) AS employee_count,
       COALESCE(TRIM(ch.prenom || ' ' || ch.nom), '') AS chef_de_service,
       COALESCE(ch.num_telephone, '') AS chef_num_telephone,
       ${servicePhoneExpr} AS num_telephone
     FROM ${store.table} s
     LEFT JOIN LATERAL (
       SELECT ${chefPrenomSelect}, ${chefNomSelect}, ${chefPhoneSelect}
       FROM utilisateur u2
       ${gradeSqlForChef.joinClause}
       WHERE ${chefRoleFilter}
         ${chefServiceMatch}
         AND ${chefGradeFilter}
       ORDER BY ${chefOrderBy}
       LIMIT 1
     ) ch ON TRUE
     ORDER BY ${
       cols.has("created_at") ? "s.created_at DESC" : `s.${store.idCol} DESC`
     }, s.${store.nameCol} ASC`
  );

  return rows;
};

const insertService = async (nom, description, servicePhone, fallbackAdminInput, db = pool) => {
  const client = await db.connect();
  try {
    const store = await getServiceStore(client);
    if (!store) throw { status: 500, message: "Table service/services introuvable." };
    const cols = await getTableColumns(store.table, client);
    await ensureAdminMatriculeConstraints(store.table, client).catch(() => null);

    if (store.table === "service" && cols.has("num_tel_service")) {
      if (!servicePhone) {
        throw { status: 400, message: "Numero de telephone service requis." };
      }
      if (servicePhone.length !== 8) {
        throw { status: 400, message: "Numero de telephone service invalide (8 chiffres)." };
      }
    }
    if (await serviceExists(store, nom, null, client)) {
      throw { status: 409, message: "Ce service existe deja." };
    }

    await client.query("BEGIN");

    const insertCols = [store.nameCol];
    const insertVals = [nom];

    if (store.table === "service") {
      const descValue = description || "Sans description";
      if (cols.has("description_service")) {
        insertCols.push("description_service");
        insertVals.push(descValue);
      }
      if (cols.has("description")) {
        insertCols.push("description");
        insertVals.push(description);
      }
      if (cols.has("matricule_admin")) {
        const { findAdminMatricule } = require("./utilisateurModel");
        const fallbackAdmin = fallbackAdminInput || (await findAdminMatricule(client));
        if (!fallbackAdmin) {
          throw { status: 400, message: "Aucun matricule admin disponible pour creer le service." };
        }
        insertCols.push("matricule_admin");
        insertVals.push(fallbackAdmin);
      }
      if (cols.has("nb_personnel_de_service")) {
        insertCols.push("nb_personnel_de_service");
        insertVals.push(0);
      }
      if (cols.has("num_tel_service")) {
        insertCols.push("num_tel_service");
        insertVals.push(servicePhone || null);
      }
      if (cols.has("chef_service")) {
        const chefService = await resolveChefName(nom, client);
        insertCols.push("chef_service");
        insertVals.push(chefService);
      }
    } else {
      if (cols.has("description")) {
        insertCols.push("description");
        insertVals.push(description);
      }
    }

    const placeholders = insertVals.map((_, idx) => `$${idx + 1}`).join(", ");
    const created = await client.query(
      `INSERT INTO ${store.table} (${insertCols.join(", ")})
       VALUES (${placeholders})
       RETURNING ${store.idCol} AS id, ${store.nameCol} AS service`,
      insertVals
    );

    await client.query("COMMIT");
    return created.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const editService = async (serviceId, nextNom, nextDescription, nextServicePhone, db = pool) => {
  const client = await db.connect();
  try {
    const store = await getServiceStore(client);
    if (!store) throw { status: 500, message: "Table service/services introuvable." };
    const cols = await getTableColumns(store.table, client);
    const userCols = await getUtilisateurColumns(client);

    if (store.table === "service" && cols.has("num_tel_service")) {
      if (!nextServicePhone) {
        throw { status: 400, message: "Numero de telephone service requis." };
      }
      if (nextServicePhone.length !== 8) {
        throw { status: 400, message: "Numero de telephone service invalide (8 chiffres)." };
      }
    }

    const existing = await client.query(
      `SELECT ${store.idCol} AS id, ${store.nameCol} AS nom
       FROM ${store.table}
       WHERE ${store.idCol}=$1`,
      [serviceId]
    );
    if (!existing.rowCount) throw { status: 404, message: "Service introuvable." };

    const prevNom = existing.rows[0].nom;
    const prevNomNormalized = normalizeLoose(prevNom);
    const nextNomNormalized = normalizeLoose(nextNom);
    if (prevNomNormalized !== nextNomNormalized && (await serviceExists(store, nextNom, serviceId, client))) {
      throw { status: 409, message: "Un autre service avec ce nom existe deja." };
    }

    const setParts = [`${store.nameCol}=$1`];
    const params = [nextNom];

    if (store.table === "service") {
      const descValue = nextDescription || "Sans description";
      if (cols.has("description_service")) {
        setParts.push(`description_service=$${params.length + 1}`);
        params.push(descValue);
      }
      if (cols.has("description")) {
        setParts.push(`description=$${params.length + 1}`);
        params.push(nextDescription);
      }
      if (cols.has("num_tel_service")) {
        setParts.push(`num_tel_service=$${params.length + 1}`);
        params.push(nextServicePhone || null);
      }
      if (cols.has("chef_service")) {
        const chefService = await resolveChefName(nextNom, client);
        setParts.push(`chef_service=$${params.length + 1}`);
        params.push(chefService);
      }
    } else if (cols.has("description")) {
      setParts.push(`description=$${params.length + 1}`);
      params.push(nextDescription);
    }

    if (cols.has("updated_at")) {
      setParts.push("updated_at=NOW()");
    }

    params.push(serviceId);

    await client.query("BEGIN");
    await client.query(
      `UPDATE ${store.table}
       SET ${setParts.join(", ")}
       WHERE ${store.idCol}=$${params.length}`,
      params
    );

    if (prevNom !== nextNom && hasCol(userCols, "service")) {
      await client.query(
        "UPDATE utilisateur SET service=$1 WHERE LOWER(TRIM(COALESCE(service, ''))) = LOWER(TRIM($2))",
        [nextNom, prevNom]
      );
    }

    if (store.table === "service" && hasCol(userCols, "id_service") && hasCol(userCols, "service")) {
      await client.query(
        "UPDATE utilisateur SET id_service=$1 WHERE LOWER(TRIM(COALESCE(service, ''))) = LOWER(TRIM($2))",
        [serviceId, nextNom]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const removeService = async (serviceId, db = pool) => {
  const client = await db.connect();
  try {
    const store = await getServiceStore(client);
    if (!store) throw { status: 500, message: "Table service/services introuvable." };
    const userCols = await getUtilisateurColumns(client);

    const existing = await client.query(
      `SELECT ${store.nameCol} AS nom
       FROM ${store.table}
       WHERE ${store.idCol}=$1`,
      [serviceId]
    );
    if (!existing.rowCount) throw { status: 404, message: "Service introuvable." };

    const serviceName = existing.rows[0].nom;
   //asque il ya des personnel liés à ce service avant de supprimer le service.
    const linkedFilter = buildPersonnelServiceFilter(userCols, serviceId, serviceName, 1);
    if (linkedFilter.hasLinks) {
      const linkedPersonnel = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM utilisateur
         WHERE ${linkedFilter.whereClause}`,
        linkedFilter.params
      );
      const linkedCount = linkedPersonnel.rows[0]?.count || 0;
      if (linkedCount > 0) {
        throw {
          status: 409,
          message: `Impossible de supprimer ce service: ${linkedCount} personnel(s) y sont encore affecte(s). Reaffectez-les d'abord.`,
        };
      }
    }

    await client.query("BEGIN");
    await client.query(`DELETE FROM ${store.table} WHERE ${store.idCol}=$1`, [serviceId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (error?.code === "23503") {
      throw {
        status: 409,
        message: "Impossible de supprimer ce service: des donnees liees existent encore.",
      };
    }
    throw error;
  } finally {
    client.release();
  }
};
// Met à jour le nombre de personnel par service .
const syncPersonnelCountForServiceRefs = async (serviceRefs = [], db = pool) => {
  const store = await getServiceStore(db);
  if (!store) return;

  const serviceCols = await getTableColumns(store.table, db).catch(() => new Set());
  if (!serviceCols.has("nb_personnel_de_service")) return;

  const userCols = await getUtilisateurColumns(db).catch(() => []);
  const refs = Array.isArray(serviceRefs) ? serviceRefs.filter(Boolean) : [];
  const visited = new Set();

  for (const ref of refs) {
    let serviceId = Number(ref?.id);
    if (!Number.isFinite(serviceId) || serviceId <= 0) {
      serviceId = await resolveServiceId(ref?.name || "", db);
    }
    if (!Number.isFinite(Number(serviceId)) || Number(serviceId) <= 0) continue;
    serviceId = Number(serviceId);

    if (visited.has(serviceId)) continue;
    visited.add(serviceId);

    const serviceName =
      (ref?.name || "").toString().trim() || (await resolveServiceNameById(serviceId, db)) || "";

    const linkedFilter = buildPersonnelServiceFilter(userCols, serviceId, serviceName, 1);
    if (!linkedFilter.hasLinks) continue;

    const countResp = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM utilisateur
       WHERE ${linkedFilter.whereClause}`,
      linkedFilter.params
    );
    const nextCount = Number(countResp.rows[0]?.count || 0);

    await db.query(
      `UPDATE ${store.table}
       SET nb_personnel_de_service = $1
       WHERE ${store.idCol} = $2`,
      [nextCount, serviceId]
    );
  }
};

module.exports = {
  getServiceStore,
  getTableColumns,
  hasCol,
  resolveServiceId,
  resolveServiceNameById,
  getAllServices,
  insertService,
  editService,
  removeService,
  syncPersonnelCountForServiceRefs,
};