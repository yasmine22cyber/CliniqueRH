const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const { getGradeStore, findGradeById, findGradeByLabel } = require("./gradeModel");
const serviceModel = require("./serviceModel");
const { getUtilisateurColumns, getTableColumns } = require("./dbUtils");
const { getPlanningStore } = require("./planningModel");
const { getPlanningRequestStore } = require("./planningRequestsModel");

const findByMatricule = async (matricule, db = pool) => {
  const cols = await getUtilisateurColumns(db);
  const hasIdGrade = cols.includes("id_grade");
  const hasGrade = cols.includes("grade");
  const gradeStore = hasIdGrade ? await getGradeStore(db).catch(() => null) : null;

  const select = ["u.matricule", "u.nom", "u.prenom", "u.email", "u.role", "u.mot_de_passe"];

  if (hasIdGrade) {
    select.push("COALESCE(u.id_grade::text, '') AS id_grade");
  } else {
    select.push("'' AS id_grade");
  }

  if (gradeStore && hasIdGrade) {
    select.push(`COALESCE(g.${gradeStore.labelCol}, '') AS grade`);
  } else if (hasGrade) {
    select.push("COALESCE(u.grade, '') AS grade");
  } else {
    select.push("'' AS grade");
  }

  const gradeJoin = gradeStore && hasIdGrade
    ? `LEFT JOIN ${gradeStore.table} g ON g.${gradeStore.idCol} = u.id_grade`
    : "";

  const query = `
    SELECT ${select.join(", ")}
    FROM utilisateur u
    ${gradeJoin}
    WHERE u.matricule = $1
    LIMIT 1
  `;

  const { rows } = await db.query(query, [matricule]);
  return rows[0] || null;
};

const findAdminMatricule = async (db = pool) => {
  const admin = await db.query(
    "SELECT matricule FROM utilisateur WHERE LOWER(role) LIKE '%admin%' ORDER BY matricule LIMIT 1"
  );
  if (admin.rowCount) return admin.rows[0].matricule;

  const anyUser = await db.query("SELECT matricule FROM utilisateur ORDER BY matricule LIMIT 1");
  if (anyUser.rowCount) return anyUser.rows[0].matricule;
  return null;
};

const checkEmailExists = async (email, db = pool) => {
  const { rows } = await db.query("SELECT 1 FROM utilisateur WHERE email=$1 LIMIT 1", [email]);
  return rows.length > 0;
};

const updatePassword = async (email, hashed, db = pool) => {
  await db.query("UPDATE utilisateur SET mot_de_passe=$1 WHERE email=$2", [hashed, email]);
};

const getChefServiceColumn = (cols) => {
  const candidates = ["chef_service", "chef_de_service", "chef"];
  return candidates.find((c) => cols.has(c)) || null;
};

// normalization lil data
const toServiceRef = (id, name) => {
  const parsedId = Number(id);
  const serviceId = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null;
  const serviceName = (name || "").toString().trim();
  if (!serviceId && !serviceName) return null;
  return { id: serviceId, name: serviceName };
};

const buildGradeSqlContext = async (userCols, userAlias = "u", gradeAlias = "g", db = pool) => {
  const hasIdGrade = userCols.includes("id_grade");
  const hasLegacyGrade = userCols.includes("grade");
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

// rechercher un chef de service selon un référentiel de service
const resolveChefNameByService = async (serviceRef, userCols, db = pool) => {
  if (!serviceRef) return null;

  const hasPrenom = userCols.includes("prenom");
  const hasNom = userCols.includes("nom");
  const hasRole = userCols.includes("role");
  const hasIdService = userCols.includes("id_service");
  const hasService = userCols.includes("service");
  if (!hasPrenom || !hasNom) return null;

  const gradeSql = await buildGradeSqlContext(userCols, "u", "g", db);
  if (gradeSql.chefFilterExpr === "FALSE") return null;

  const whereParts = [gradeSql.chefFilterExpr];
  const params = [];
  if (hasRole) whereParts.push("LOWER(COALESCE(u.role, '')) = 'personnel'");

  if (serviceRef.id && hasIdService) {
    params.push(serviceRef.id);
    whereParts.push(`u.id_service = $${params.length}`);
  } else if (serviceRef.name && hasService) {
    params.push(serviceRef.name);
    whereParts.push(`LOWER(TRIM(COALESCE(u.service, ''))) = LOWER(TRIM($${params.length}))`);
  } else {
    return null;
  }

  const { rows } = await db.query(
    `SELECT TRIM(COALESCE(u.prenom, '') || ' ' || COALESCE(u.nom, '')) AS full_name
     FROM utilisateur u
     ${gradeSql.joinClause}
     WHERE ${whereParts.join(" AND ")}
     ORDER BY u.nom ASC, u.prenom ASC
     LIMIT 1`,
    params
  );
  return rows[0]?.full_name || null;
};

const syncChefForServiceRef = async (serviceRef, userCols, db = pool) => {
  if (!serviceRef) return;

  const store = await serviceModel.getServiceStore(db);
  if (!store) return;

  const serviceCols = await serviceModel.getTableColumns(store.table, db);
  const chefCol = getChefServiceColumn(serviceCols);
  if (!chefCol) return;

  const ref = { ...serviceRef };
  if (!ref.id && ref.name) {
    ref.id = await serviceModel.resolveServiceId(ref.name, db);
  }
  if (!ref.name && ref.id) {
    ref.name = await serviceModel.resolveServiceNameById(ref.id, db);
  }
  if (!ref.id && !ref.name) return;

  const chefName = await resolveChefNameByService(ref, userCols, db);

  if (ref.id) {
    await db.query(
      `UPDATE ${store.table} SET ${chefCol} = $1 WHERE ${store.idCol} = $2`,
      [chefName || null, ref.id]
    );
    return;
  }

  await db.query(
    `UPDATE ${store.table}
     SET ${chefCol} = $1
     WHERE LOWER(TRIM(COALESCE(${store.nameCol}, ''))) = LOWER(TRIM($2))`,
    [chefName || null, ref.name]
  );
};
//update foreach service
const syncChefForServiceRefs = async (refs = [], db = pool) => {
  const uniqueRefs = [];
  const seen = new Set();
  refs.filter(Boolean).forEach((ref) => {
    const key = ref.id ? `id:${ref.id}` : `name:${(ref.name || "").toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRefs.push(ref);
    }
  });
  if (!uniqueRefs.length) return;

  const userCols = await getUtilisateurColumns(db);
  for (const ref of uniqueRefs) {
    await syncChefForServiceRef(ref, userCols, db);
  }
};

const normalizeLoose = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const isChefServiceGradeLabel = (label = "") => normalizeLoose(label).includes("chef de service");

const findExistingChefInService = async ({ serviceRef, excludeMatricule = null, db = pool }) => {
  if (!serviceRef) return null;
  const userCols = await getUtilisateurColumns(db);

  const gradeSql = await buildGradeSqlContext(userCols, "u", "g", db);
  if (gradeSql.chefFilterExpr === "FALSE") return null;

  const whereParts = [gradeSql.chefFilterExpr];
  const params = [];

  if (userCols.includes("role")) {
    whereParts.push("LOWER(COALESCE(u.role, '')) = 'personnel'");
  }

  if (serviceRef.id && userCols.includes("id_service")) {
    params.push(Number(serviceRef.id));
    whereParts.push(`u.id_service = $${params.length}`);
  } else if (serviceRef.name && userCols.includes("service")) {
    params.push(serviceRef.name);
    whereParts.push(`LOWER(TRIM(COALESCE(u.service, ''))) = LOWER(TRIM($${params.length}))`);
  } else {
    return null;
  }

  if (excludeMatricule) {
    params.push(String(excludeMatricule));
    whereParts.push(
      `regexp_replace(COALESCE(u.matricule, ''), '\\D', '', 'g') <> $${params.length}`
    );
  }

  const { rows } = await db.query(
    `SELECT u.matricule,
            TRIM(COALESCE(u.prenom, '') || ' ' || COALESCE(u.nom, '')) AS full_name
     FROM utilisateur u
     ${gradeSql.joinClause}
     WHERE ${whereParts.join(" AND ")}
     ORDER BY u.nom ASC, u.prenom ASC
     LIMIT 1`,
    params
  );

  if (!rows.length) return null;
  const row = rows[0];
  return {
    matricule: String(row.matricule || "").trim(),
    fullName: String(row.full_name || "").trim(),
  };
};

const assertUniqueChefInService = async ({ matricule, serviceRef, gradeLabel, db = pool }) => {
  if (!serviceRef) return;
  if (!isChefServiceGradeLabel(gradeLabel)) return;

  const existing = await findExistingChefInService({ serviceRef, excludeMatricule: matricule, db });
  if (!existing) return;

  const existingLabel = existing.fullName || existing.matricule;
  const resolvedServiceName =
    serviceRef.name ||
    (serviceRef.id ? await serviceModel.resolveServiceNameById(serviceRef.id, db).catch(() => null) : null) ||
    null;
  throw {
    status: 409,
    message: `Ce service a déjà un Chef de service (${existingLabel}).`,
    fields: ["grade", "service"],
    fieldMessages: {
      grade: `Un seul Chef de service est autorisé par service. Chef actuel: ${existingLabel}.`,
      ...(resolvedServiceName ? { service: `Service concerné: ${resolvedServiceName}.` } : {}),
    },
  };
};

const buildPersonnelSelect = async (db = pool) => {
  const cols = await getUtilisateurColumns(db);

  const select = ["u.matricule", "u.nom", "u.prenom", "u.email", "u.role"];
  const joins = [];

  const gradeSql = await buildGradeSqlContext(cols, "u", "g", db);
  if (gradeSql.joinClause) joins.push(gradeSql.joinClause);
  select.push(`${gradeSql.labelExpr} AS grade`);

  if (cols.includes("id_grade")) {
    select.push("COALESCE(u.id_grade::text, '') AS id_grade");
  } else {
    select.push("'' AS id_grade");
  }

  if (cols.includes("id_service")) {
    const store = await serviceModel.getServiceStore(db);
    if (store) {
      select.push(`COALESCE(s.${store.nameCol}, '') AS service`);
      select.push("COALESCE(u.id_service::text, '') AS id_service");
      joins.push(`LEFT JOIN ${store.table} s ON u.id_service = s.${store.idCol}`);
    } else {
      select.push("COALESCE(u.id_service::text, '') AS service");
    }
  } else if (cols.includes("service")) {
    select.push("COALESCE(u.service, '') AS service");
  }

  if (cols.includes("cin")) {
    select.push("COALESCE(u.cin, '') AS cin");
  }

  if (cols.includes("type_contrat")) {
    select.push("COALESCE(u.type_contrat, '') AS type_contrat");
  }

  if (cols.includes("num_telephone")) {
    select.push("COALESCE(u.num_telephone, '') AS num_telephone");
  }

  if (cols.includes("adresse")) {
    select.push("COALESCE(u.adresse, '') AS adresse");
  }

  if (cols.includes("date_embauche")) {
    select.push("u.date_embauche");
  }

  return { select, cols, joinSql: joins.join("\n") };
};

const getAllPersonnel = async (db = pool) => {
  const { select, joinSql } = await buildPersonnelSelect(db);
  const query = `
    SELECT ${select.join(", ")}
    FROM utilisateur u
    ${joinSql || ""}
    WHERE LOWER(u.role) = 'personnel'
    ORDER BY u.nom, u.prenom
  `;
  const { rows } = await db.query(query);
  return rows;
};

const getPersonnelProfileByMatricule = async (matricule, db = pool) => {
  const { select, joinSql } = await buildPersonnelSelect(db);
  const query = `
    SELECT ${select.join(", ")}
    FROM utilisateur u
    ${joinSql || ""}
    WHERE u.matricule = $1
    LIMIT 1
  `;
  const { rows } = await db.query(query, [matricule]);
  return rows[0] || null;
};
//validation de doublons n'existe pas
const checkPersonnelConflicts = async (m, mail, cinVal, phoneVal, excludeMatricule = null, db = pool) => {
  let query = `
    SELECT matricule, email, cin, num_telephone
    FROM utilisateur
    WHERE (
      regexp_replace(COALESCE(matricule, ''), '\\D', '', 'g') = $1
      OR LOWER(TRIM(COALESCE(email, ''))) = $2
      OR regexp_replace(COALESCE(cin, ''), '\\D', '', 'g') = $3
      OR regexp_replace(COALESCE(num_telephone, ''), '\\D', '', 'g') = $4
    )
  `;
  const params = [m, mail, cinVal, phoneVal];

  if (excludeMatricule) {
    params.push(excludeMatricule);
    query += ` AND regexp_replace(COALESCE(matricule, ''), '\\D', '', 'g') <> $5`;
  }

  const dup = await db.query(query, params);
  if (dup.rowCount > 0) {
    const conflicts = [];
    const fieldMessages = {};
    dup.rows.forEach((r) => {
      const rowMatricule = (String(r.matricule ?? "").match(/\d/g) || []).join("").slice(0, 10);
      const rowEmail = (String(r.email ?? "")).trim().toLowerCase();
      const rowCin = (String(r.cin ?? "").match(/\d/g) || []).join("").slice(0, 8);
      const rowPhone = (String(r.num_telephone ?? "").match(/\d/g) || []).join("").slice(0, 8);

      if (rowMatricule === m) {
        conflicts.push("matricule");
        fieldMessages.matricule = "Matricule déjà utilisé.";
      }
      if (rowEmail === mail) {
        conflicts.push("email");
        fieldMessages.email = "Email déjà utilisé.";
      }
      if (rowCin === cinVal) {
        conflicts.push("cin");
        fieldMessages.cin = "CIN déjà utilisé.";
      }
      if (rowPhone === phoneVal) {
        conflicts.push("phone");
        fieldMessages.phone = "Téléphone déjà utilisé.";
      }
    });
    throw { status: 409, message: "Des champs sont déjà utilisés.", fields: [...new Set(conflicts)], fieldMessages };
  }
};

const insertPersonnel = async (m, p, n, mail, pwd, cinVal, phoneVal, adresseVal, contractVal, gradeIdVal, roleVal, hireDate, service, gradeLabel = "", db = pool) => {
  await checkPersonnelConflicts(m, mail, cinVal, phoneVal, null, db);

  const hash = await bcrypt.hash(pwd, 10);
  const cols = await getUtilisateurColumns(db);
  const fields = ["matricule", "nom", "prenom", "email", "role", "mot_de_passe"];
  const values = [m, n, p, mail, roleVal, hash];

  const hasIdService = cols.includes("id_service");
  const hasServiceName = cols.includes("service");
  const hasIdGrade = cols.includes("id_grade");
  const serviceIdVal = hasIdService ? await serviceModel.resolveServiceId(service, db) : null;
  const fallbackServiceName = serviceIdVal ? await serviceModel.resolveServiceNameById(serviceIdVal, db) : null;
  const serviceNameVal = hasServiceName ? ((service || "").toString().trim() || fallbackServiceName || null) : null;

  const gradeLabelForCheck =
    (gradeLabel || "").toString().trim() ||
    (gradeIdVal ? (await findGradeById(gradeIdVal, db).catch(() => null))?.type_de_grade || "" : "");
  await assertUniqueChefInService({
    matricule: null,
    serviceRef: hasIdService || hasServiceName ? toServiceRef(serviceIdVal, serviceNameVal) : null,
    gradeLabel: gradeLabelForCheck,
    db,
  });

  const optionalMap = [
    { col: hasIdGrade ? "id_grade" : null, val: gradeIdVal },
    { col: hasIdService ? "id_service" : null, val: serviceIdVal },
    { col: hasServiceName ? "service" : null, val: serviceNameVal },
    { col: "cin", val: cinVal },
    { col: "type_contrat", val: contractVal },
    { col: "date_embauche", val: hireDate || null },
    { col: "num_telephone", val: phoneVal },
    { col: "adresse", val: adresseVal },
  ].filter(({ col }) => Boolean(col));

  optionalMap.forEach(({ col, val }) => {
    if (cols.includes(col)) {
      fields.push(col);
      values.push(val ?? null);
    }
  });

  const placeholders = fields.map((_, idx) => `$${idx + 1}`).join(", ");
  const sql = `INSERT INTO utilisateur (${fields.join(", ")}) VALUES (${placeholders})`;
  await db.query(sql, values);

  await syncChefForServiceRefs([hasIdService || hasServiceName ? toServiceRef(serviceIdVal, serviceNameVal) : null], db);
};

const updatePersonnelData = async (matriculeParam, reqBody, db = pool) => {
  const existingRes = await db.query("SELECT * FROM utilisateur WHERE matricule=$1", [matriculeParam]);
  if (!existingRes.rowCount) {
    throw { status: 404, message: "Personnel introuvable." };
  }
  const current = existingRes.rows[0];

  const {
    matricule,
    prenom,
    nom,
    email,
    oldPassword,
    password,
    role,
    categorie,
    grade,
    id_grade,
    service,
    cin,
    contract,
    type_contrat,
    hireDate,
    date_embauche,
    phone,
    num_telephone,
    adresse,
  } = reqBody || {};

  const normalizeRole = (role) => {
    const r = (role || "Personnel").toString().trim();
    const lower = r.toLowerCase();
    if (["admin rh", "adminrh", "admin"].includes(lower)) return "Admin RH";
    return "Personnel";
  };
  
  const normalizePersonName = (value) => {
    const text = `${value ?? ""}`.replace(/\s+/g, " ").trim();
    if (!text) return "";
    return text.charAt(0).toUpperCase() + text.slice(1);
  };

  const m = (String(matricule ?? current.matricule ?? "").match(/\d/g) || []).join("").slice(0, 10);
  const p = normalizePersonName(prenom ?? current.prenom);
  const n = normalizePersonName(nom ?? current.nom);
  const mail = (email ?? current.email ?? "").toString().trim().toLowerCase();
  const pwd = typeof password === "string" && password ? password : null;
  const cinVal = (String(cin ?? current.cin ?? "").match(/\d/g) || []).join("").slice(0, 8);
  const actualPhone = phone ?? num_telephone;
  const phoneVal = ((String(actualPhone ?? current.num_telephone ?? "").match(/\d/g) || []).join("") + "00000000").slice(0, 8);
  const adresseVal = ((typeof adresse === "string" ? adresse : current.adresse || "").trim()) || "Adresse non fournie";
  const actualContract = contract ?? type_contrat;
  const contractVal = (actualContract ?? current.type_contrat) || "CDI (Contrat à Durée Indéterminée)";
  const gradeInput = `${grade ?? ""}`.trim();
  let gradeIdVal = Number.isFinite(Number(id_grade ?? current.id_grade)) && Number(id_grade ?? current.id_grade) > 0
    ? Number(id_grade ?? current.id_grade)
    : null;
  const actualRole = role ?? categorie;
  const roleVal = normalizeRole(actualRole ?? current.role);
  const actualHireDate = hireDate ?? date_embauche;
  const hireDateVal = actualHireDate ?? current.date_embauche;

  if (m.length !== 10) throw { status: 400, message: "Matricule invalide (10 chiffres)." };
  if (!p || !n) throw { status: 400, message: "Nom et prénom requis." };
  if (!mail || mail.indexOf("@") === -1 || mail.lastIndexOf(".") < mail.indexOf("@") + 2) {
    throw { status: 400, message: "Email invalide." };
  }
  if (cinVal.length !== 8) throw { status: 400, message: "CIN invalide (8 chiffres)." };
  if (phoneVal.length !== 8) throw { status: 400, message: "Téléphone invalide (8 chiffres)." };
  if (!hireDateVal) throw { status: 400, message: "Date d'embauche requise." };

  if (!gradeIdVal && gradeInput) {
    const gradeFromLabel = await findGradeByLabel(gradeInput, db);
    if (!gradeFromLabel) {
      throw { status: 400, message: "Grade introuvable." };
    }
    gradeIdVal = gradeFromLabel.id_grade;
  }

  let resolvedGradeLabel = gradeInput;
  if (gradeIdVal) {
    const gradeRow = await findGradeById(gradeIdVal, db);
    if (!gradeRow) {
      throw { status: 400, message: "Grade introuvable." };
    }
    if (!resolvedGradeLabel) resolvedGradeLabel = gradeRow.type_de_grade;
  }

  await checkPersonnelConflicts(m, mail, cinVal, phoneVal, matriculeParam, db);

  const cols = await getUtilisateurColumns(db);
  const fields = [];
  const values = [];
  const pushField = (col, val) => {
    if (!cols.includes(col)) return;
    fields.push(`${col}=$${fields.length + 1}`);
    values.push(val);
  };

  pushField("matricule", m);
  pushField("nom", n);
  pushField("prenom", p);
  pushField("email", mail);
  pushField("role", roleVal);
  pushField("id_grade", gradeIdVal);
  pushField("cin", cinVal);
  pushField("type_contrat", contractVal);
  pushField("date_embauche", hireDateVal);
  pushField("num_telephone", phoneVal);
  pushField("adresse", adresseVal);

  const hasIdService = cols.includes("id_service");
  const hasServiceName = cols.includes("service");
  const previousServiceRef = hasIdService
    ? toServiceRef(current.id_service, current.service)
    : hasServiceName
    ? toServiceRef(null, current.service)
    : null;

  let nextServiceId = null;
  if (hasIdService) {
    nextServiceId = await serviceModel.resolveServiceId(service ?? current.id_service ?? null, db);
    pushField("id_service", nextServiceId);
  }

  let nextServiceName = null;
  if (hasServiceName) {
    const providedServiceName = (service || "").toString().trim();
    nextServiceName =
      providedServiceName ||
      (nextServiceId ? await serviceModel.resolveServiceNameById(nextServiceId, db) : (current.service || "").toString().trim()) ||
      null;
    pushField("service", nextServiceName);
  }

  const nextServiceRefForChefCheck = hasIdService
    ? toServiceRef(nextServiceId ?? current.id_service, nextServiceName ?? current.service)
    : hasServiceName
    ? toServiceRef(null, nextServiceName ?? current.service)
    : null;

  await assertUniqueChefInService({
    matricule: matriculeParam,
    serviceRef: nextServiceRefForChefCheck,
    gradeLabel: resolvedGradeLabel || "",
    db,
  });

  if (pwd) {
    if (!oldPassword) {
      throw { status: 400, message: "L'ancien mot de passe est requis.", fieldMessages: { oldPassword: "Requis pour changer le mot de passe." } };
    }
    const isMatch = await bcrypt.compare(oldPassword, current.mot_de_passe);
    if (!isMatch) {
      throw { status: 400, message: "L'ancien mot de passe est incorrect.", fieldMessages: { oldPassword: "Mot de passe incorrect." } };
    }
    const hash = await bcrypt.hash(pwd, 10);
    pushField("mot_de_passe", hash);
  }

  if (!fields.length) {
    throw { status: 400, message: "Aucune donnée à mettre à jour." };
  }

  values.push(matriculeParam);
  const sql = `UPDATE utilisateur SET ${fields.join(", ")} WHERE matricule=$${values.length}`;
  await db.query(sql, values);

  const nextServiceRef = hasIdService
    ? toServiceRef(nextServiceId, service)
    : hasServiceName
    ? toServiceRef(null, service ?? current.service)
    : null;

  await syncChefForServiceRefs([previousServiceRef, nextServiceRef], db);
};

const deletePersonnelData = async (matriculeParam, db = pool) => {
  const cols = await getUtilisateurColumns(db);
  const selectCols = ["matricule"];
  if (cols.includes("id_service")) selectCols.push("id_service");
  if (cols.includes("service")) selectCols.push("service");

  const existing = await db.query(
    `SELECT ${selectCols.join(", ")} FROM utilisateur WHERE matricule=$1`,
    [matriculeParam]
  );
  if (!existing.rowCount) {
    throw { status: 404, message: "Personnel introuvable." };
  }
  const current = existing.rows[0];
  const previousServiceRef = cols.includes("id_service")
    ? toServiceRef(current.id_service, current.service)
    : cols.includes("service")
    ? toServiceRef(null, current.service)
    : null;

  const planningStore = await getPlanningStore(db).catch(() => null);
  const requestsStore = await getPlanningRequestStore(db).catch(() => null);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    if (planningStore?.table) {
      const planningCols = await getTableColumns(planningStore.table, client).catch(() => new Set());
      const planningIdCol = planningCols.has("id") ? "id" : planningCols.has("id_planning") ? "id_planning" : "id";

      const idsResp = await client.query(
        `SELECT ${planningIdCol}::int AS pid FROM ${planningStore.table} WHERE matricule=$1`,
        [matriculeParam]
      );
      const planningIds = idsResp.rows
        .map((r) => Number.parseInt(r.pid, 10))
        .filter((v) => Number.isInteger(v) && v > 0);

      if (requestsStore?.table && planningIds.length) {
        await client.query(`DELETE FROM ${requestsStore.table} WHERE planning_id = ANY($1::int[])`, [planningIds]);
      }

      await client.query(`DELETE FROM ${planningStore.table} WHERE matricule=$1`, [matriculeParam]);
    }

    const congesCols = await getTableColumns("conges", client).catch(() => new Set());
    if (congesCols.has("matricule")) {
      await client.query("DELETE FROM conges WHERE matricule=$1", [matriculeParam]);
    }

    const attendanceCols = await getTableColumns("attendance_events", client).catch(() => new Set());
    if (attendanceCols.has("matricule")) {
      await client.query("DELETE FROM attendance_events WHERE matricule=$1", [matriculeParam]);
    }

    const fichePaieCols = await getTableColumns("fiche_paie", client).catch(() => new Set());
    if (fichePaieCols.has("matricule")) {
      await client.query("DELETE FROM fiche_paie WHERE matricule=$1", [matriculeParam]);
    }

    await client.query("DELETE FROM utilisateur WHERE matricule=$1", [matriculeParam]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (error?.code === "23503") {
      throw { status: 409, message: "Suppression impossible: ce personnel est lié à des données (emplois du temps / demandes / congés / pointage / paie)." };
    }
    throw error;
  } finally {
    client.release();
  }

  await syncChefForServiceRefs([previousServiceRef], db);
};

module.exports = {
  findByMatricule,
  getUtilisateurColumns,
  findAdminMatricule,
  checkEmailExists,
  updatePassword,
  getAllPersonnel,
  getPersonnelProfileByMatricule,
  insertPersonnel,
  updatePersonnelData,
  deletePersonnelData,
};