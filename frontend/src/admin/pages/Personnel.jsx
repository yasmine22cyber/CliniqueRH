import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../../admin/admin.css";
import PersonnelCreateModal from "../components/PersonnelCreateModal";
import PersonnelDeleteModal from "../components/PersonnelDeleteModal";
import PersonnelEditModal from "../components/PersonnelEditModal";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : "http://localhost:5000");

const CONTRACT_OPTIONS = ["CDI (Contrat à Durée Indéterminée)", "CDD", "Stage"];

const ROLE_OPTIONS = [
  { key: "medecin", label: "Médecin" },
  { key: "infirmier", label: "Infirmier" },
  { key: "paramedical", label: "Cadre / Personnel paramédical" },
];

const ROLE_KEYS = ROLE_OPTIONS.map((r) => r.key);

const STAGIAIRE_LABEL = "Stagiaire";

const EMPTY_GRADE_OPTIONS = {
  medecin: [],
  infirmier: [],
  paramedical: [],
  autre: [],
};

const PAGE_SIZE = 7;

const normalizeLoose = (value = "") =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const normalizeCategory = (value, fallback = "medecin") => {
  const lower = (value || "").toString().trim().toLowerCase();
  if (!lower) return fallback;
  if (lower.startsWith("med")) return "medecin";
  if (lower.includes("inf")) return "infirmier";
  if (lower.includes("para") || lower.includes("sage") || lower.includes("kin") || lower.includes("lab")) {
    return "paramedical";
  }
  if (lower.startsWith("autre")) return "autre";
  return lower;
};

const detectRoleByGrade = (grade = "", fallback = "medecin") => {
  const lower = grade.toString().trim().toLowerCase();
  if (lower.includes("inf")) return "infirmier";
  if (lower.includes("sage") || lower.includes("kin") || lower.includes("labor") || lower.includes("para")) {
    return "paramedical";
  }
  if (lower.includes("cadre")) return "paramedical";
  return fallback;
};

const isStagiaireGrade = (grade = "") => grade.toString().trim().toLowerCase() === STAGIAIRE_LABEL.toLowerCase();

const displayDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("fr-FR");
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (str.includes("T")) return str.split("T")[0];
  return str.slice(0, 10);
};

const todayISO = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const adjusted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
};

const asLocalISODate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA");
};

const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

const isMedecineGeneraleService = (serviceName = "") => {
  const normalized = normalizeLoose(serviceName);
  return (
    normalized.includes("medecine generale") ||
    normalized.includes("medecin general") ||
    normalized.includes("medecin generale")
  );
};

const resolveForcedServiceForGrade = (grade = "", services = []) => {
  const gradeNorm = normalizeLoose(grade);
  let expected = null;
  let keywords = [];

  if (gradeNorm.includes("generaliste")) {
    expected = "Médecine générale";
    keywords = ["medecine generale", "medecin general", "medecin generale"];
  } else if (gradeNorm.includes("gynecologue") || gradeNorm.includes("gyneco")) {
    expected = "Maternite";
    keywords = ["maternite"];
  } else if (gradeNorm.includes("sage-femme") || gradeNorm.includes("sage femme")) {
    expected = "Maternite";
    keywords = ["maternite"];
  } else if (gradeNorm.includes("laboratoire") || gradeNorm.includes("labo")) {
    expected = "Laboratoire";
    keywords = ["laboratoire", "labo"];
  } else if (gradeNorm.includes("kine") || gradeNorm.includes("kinesither")) {
    expected = "Kinesitherapie";
    keywords = ["kinesitherapie", "kine"];
  }

  if (!expected) {
    return { shouldForce: false, forcedService: null, expectedService: null };
  }

  const foundService = services.find((serviceName) => {
    const serviceNorm = normalizeLoose(serviceName);
    return keywords.some((key) => serviceNorm.includes(key));
  });

  return {
    shouldForce: true,
    forcedService: foundService || null,
    expectedService: expected,
  };
};

const isChefServiceGrade = (grade = "") => normalizeLoose(grade).includes("chef de service");

const resolveMedecinGradeKey = (gradeLabel = "") => {
  const normalizedGrade = normalizeLoose(gradeLabel);
  if (!normalizedGrade) return "";
  if (normalizedGrade.includes("generaliste")) return "generaliste";
  if (normalizedGrade.includes("gynecologue") || normalizedGrade.includes("gyneco")) return "specialiste";
  if (normalizedGrade.includes("interne")) return "interne";
  if (normalizedGrade.includes("resident")) return "resident";
  if (normalizedGrade.includes("specialiste")) return "specialiste";
  if (normalizedGrade.includes("senior")) return "senior";
  if (normalizedGrade.includes("chef de service")) return "chef_service";
  return "";
};

const getContractTypeKey = (contractLabel = "") => {
  const normalized = normalizeLoose(contractLabel);
  if (!normalized) return "";
  if (normalized.startsWith("cdi")) return "cdi";
  if (normalized === "cdd") return "cdd";
  if (normalized === "stage") return "stage";
  return "";
};

const getContractLabelByType = (typeKey = "") => {
  if (typeKey === "cdi") return CONTRACT_OPTIONS.find((c) => getContractTypeKey(c) === "cdi") || "CDI";
  if (typeKey === "cdd") return CONTRACT_OPTIONS.find((c) => getContractTypeKey(c) === "cdd") || "CDD";
  if (typeKey === "stage") return CONTRACT_OPTIONS.find((c) => getContractTypeKey(c) === "stage") || "Stage";
  return "";
};

const resolveContractPolicy = ({ roleKey = "", gradeLabel = "", mode = "create" }) => {
  const normalizedRole = normalizeLoose(roleKey);

  if (isStagiaireGrade(gradeLabel)) {
    return {
      allowedTypes: ["stage"],
      forcedType: "stage",
      hint: "Stagiaire: contrat Stage obligatoire.",
    };
  }

  if (normalizedRole === "infirmier") {
    return {
      allowedTypes: ["cdi", "cdd"],
      forcedType: null,
      hint: "",
    };
  }

  if (normalizedRole !== "medecin") {
    return {
      allowedTypes: ["cdi", "cdd"],
      forcedType: null,
      hint: "",
    };
  }

  const medecinGradeKey = resolveMedecinGradeKey(gradeLabel);
  if (medecinGradeKey === "interne" || medecinGradeKey === "resident") {
    if (mode === "create") {
      return {
        allowedTypes: ["cdi"],
        forcedType: "cdi",
        hint: "Médecin interne / Résident: CDI obligatoire à l'ajout.",
      };
    }
    return {
      allowedTypes: ["cdi", "cdd"],
      forcedType: null,
      hint: "",
    };
  }

  if (medecinGradeKey === "specialiste" || medecinGradeKey === "generaliste") {
    return {
      allowedTypes: ["cdi", "cdd"],
      forcedType: null,
      hint: "",
    };
  }

  if (medecinGradeKey === "surveillant" || medecinGradeKey === "chef_service") {
    return {
      allowedTypes: ["cdd"],
      forcedType: "cdd",
      hint: "Surveillant / Chef de service: contrat CDD obligatoire.",
    };
  }

  return {
    allowedTypes: ["cdi", "cdd"],
    forcedType: null,
    hint: "",
  };
};

const resolveParamedicalServiceOptions = (services = []) => {
  const targets = [["maternite"], ["laboratoire", "labo"], ["kinesitherapie", "kine"]];

  const found = targets
    .map((keywords) =>
      services.find((serviceName) => {
        const serviceNorm = normalizeLoose(serviceName);
        return keywords.some((key) => serviceNorm.includes(key));
      })
    )
    .filter(Boolean);

  return Array.from(new Set(found));
};

const normalizeNameInput = (value = "") => {
  const compact = value.toString().replace(/\s+/g, " ").replace(/^\s+/, "");
  if (!compact) return "";
  return compact.charAt(0).toUpperCase() + compact.slice(1);
};

const resolveGradeStepKey = (roleKey = "", gradeLabel = "") => {
  const normalizedRole = normalizeLoose(roleKey);
  const normalizedGrade = normalizeLoose(gradeLabel);
  if (!normalizedGrade) return "";

  if (normalizedGrade.includes("stagiaire")) return "stagiaire";

  if (normalizedRole === "medecin") {
    if (normalizedGrade.includes("generaliste")) return "medecin_generale";
    if (normalizedGrade.includes("gynecologue") || normalizedGrade.includes("gyneco")) return "specialiste";
    if (normalizedGrade.includes("interne")) return "interne";
    if (normalizedGrade.includes("resident")) return "resident";
    if (normalizedGrade.includes("specialiste")) return "specialiste";
    if (normalizedGrade.includes("senior")) return "senior";
    if (normalizedGrade.includes("chef de service")) return "chef_service";
    return "";
  }

  return "";
};

const validateGradeTransition = ({ roleKey = "", fromGrade = "", toGrade = "" }) => {
  const normalizedRole = normalizeLoose(roleKey);
  if (!fromGrade || !toGrade || fromGrade === toGrade) return { ok: true };
  if (normalizedRole !== "medecin") return { ok: true };

  const fromKey = resolveGradeStepKey(normalizedRole, fromGrade);
  const toKey = resolveGradeStepKey(normalizedRole, toGrade);

  if (!fromKey || !toKey) return { ok: true };

  if (fromKey === "medecin_generale" && toKey !== "medecin_generale") {
    return { ok: false, message: "Médecin généraliste ne peut pas être modifié." };
  }
  if (toKey === "medecin_generale" && fromKey !== "medecin_generale") {
    return { ok: false, message: "Passage vers Médecin généraliste interdit." };
  }

  const steps = ["stagiaire", "interne", "resident", "specialiste", "senior", "chef_service"];
  const fromIndex = steps.indexOf(fromKey);
  const toIndex = steps.indexOf(toKey);
  const isKnown = fromIndex >= 0 && toIndex >= 0;

  if (fromKey === "chef_service" && toKey === "senior") return { ok: true };

  if (isKnown && toIndex < fromIndex) {
    return {
      ok: false,
      message:
        "Progression médecin invalide (ordre): Stagiaire -> Médecin interne -> Resident -> Specialiste -> Senior -> Chef de service.",
    };
  }

  return { ok: true };
};

const buildDefaultForm = () => ({
  matricule: "",
  prenom: "",
  nom: "",
  email: "",
  cin: "",
  hireDate: "",
  password: "",
  contract: CONTRACT_OPTIONS[0],
  roleCategory: "medecin",
  grade: "",
  gradeId: null,
  service: "",
  phone: "",
  adresse: "",
});

const emptySuccessModal = { open: false, title: "", body: "" };

function usePersonnelCrudModals({
  serviceOptions,
  setServiceOptions,
  gradeOptions,
  gradesLoading,
  reloadList,
}) {
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // create | edit
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [form, setForm] = useState(() => buildDefaultForm());
  const [formErrors, setFormErrors] = useState({});
  const [editMatricule, setEditMatricule] = useState(null);
  const [generatedPwd, setGeneratedPwd] = useState("");
  const [autoGeneratePwd, setAutoGeneratePwd] = useState(false);
  const [originalContract, setOriginalContract] = useState(null);
  const [originalGrade, setOriginalGrade] = useState("");
  const [successModal, setSuccessModal] = useState(emptySuccessModal);

  const closeSuccessModal = useCallback(() => setSuccessModal(emptySuccessModal), []);

  const ensureServiceOption = useCallback(
    (name) => {
      const val = (name || "").trim();
      if (!val) return;
      setServiceOptions((prev) => (prev.includes(val) ? prev : [...prev, val]));
    },
    [setServiceOptions]
  );

  const getFirstGradeForRole = useCallback(
    (roleKey) => {
      const list = gradeOptions[roleKey] || [];
      const first = list[0];
      if (first) return { grade: first.label, gradeId: first.id };
      return { grade: "", gradeId: null };
    },
    [gradeOptions]
  );

  const findGradeByValue = useCallback(
    (value, categorieHint = "") => {
      const all = Object.values(gradeOptions).flat();
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) {
        const foundById = all.find((g) => Number(g.id) === numeric);
        if (foundById) return foundById;
      }
      const matches = all.filter((g) => g.label === value);
      if (!matches.length) return null;
      if (matches.length === 1) return matches[0];
      const catKey = normalizeCategory(categorieHint || "");
      if (catKey) {
        const foundByCat = matches.find((g) => normalizeCategory(g.categorie || "") === catKey);
        if (foundByCat) return foundByCat;
      }
      return matches[0] || null;
    },
    [gradeOptions]
  );

  const closePersonnelModal = useCallback(() => {
    setShowModal(false);
    setFormErrors({});
    setGeneratedPwd("");
    setAutoGeneratePwd(false);
  }, []);

  useEffect(() => {
    if (modalMode === "create" && showModal && !form.service && serviceOptions.length) {
      setForm((prev) => ({ ...prev, service: serviceOptions[0] }));
    }
  }, [serviceOptions, modalMode, showModal, form.service]);

  useEffect(() => {
    if (modalMode !== "create" || !showModal) return;
    const list = gradeOptions[form.roleCategory] || [];
    if (!list.length) return;
    const hasCurrent = list.some((g) => g.label === form.grade);
    if (!hasCurrent) {
      const next = list[0];
      setForm((prev) => ({ ...prev, grade: next.label, gradeId: next.id || null }));
    }
  }, [gradeOptions, form.roleCategory, modalMode, showModal, form.grade]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timer = setTimeout(() => setSuccessMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    if (!actionError) return undefined;
    const timer = setTimeout(() => setActionError(""), 4000);
    return () => clearTimeout(timer);
  }, [actionError]);

  const validate = useCallback(
    (values, mode) => {
      const errs = {};
      const forcedServiceInfo = resolveForcedServiceForGrade(values.grade, serviceOptions);
      const forcedServiceValue = forcedServiceInfo.forcedService;
      const contractPolicy = resolveContractPolicy({
        roleKey: values.roleCategory,
        gradeLabel: values.grade,
        mode,
      });

      if (!/^\d{10}$/.test(values.matricule)) errs.matricule = "Matricule: 10 chiffres.";
      if (!values.prenom.trim()) errs.prenom = "Prénom requis.";
      else if (/\d/.test(values.prenom)) errs.prenom = "Prénom: lettres uniquement.";
      if (!values.nom.trim()) errs.nom = "Nom requis.";
      else if (/\d/.test(values.nom)) errs.nom = "Nom: lettres uniquement.";
      if (!/\S+@\S+\.\S+/.test(values.email)) errs.email = "Email invalide.";
      if (!/^\d{8}$/.test(values.cin)) errs.cin = "CIN: 8 chiffres.";
      if (!/^\d{8}$/.test(values.phone)) errs.phone = "Téléphone: 8 chiffres.";
      if (!values.hireDate) {
        errs.hireDate = "Date d'embauche requise.";
      } else if (values.hireDate > todayISO()) {
        errs.hireDate = "Pas de date future.";
      }

      const pwd = values.password;
      if (mode === "create") {
        if (!pwd) errs.password = "Mot de passe requis.";
        else if (!/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(pwd)) {
          errs.password = "8+ caractères avec maj, chiffre et symbole.";
        }
      } else if (pwd && !/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(pwd)) {
        errs.password = "8+ caractères avec maj, chiffre et symbole.";
      }

      if (!values.roleCategory) errs.roleCategory = "Rôle requis.";
      if (!values.grade) errs.grade = "Grade requis.";
      if (!values.contract) errs.contract = "Contrat requis.";

      const selectedContractType = getContractTypeKey(values.contract);
      if (
        contractPolicy.allowedTypes.length &&
        selectedContractType &&
        !contractPolicy.allowedTypes.includes(selectedContractType)
      ) {
        errs.contract = contractPolicy.hint || "Contrat invalide pour ce grade.";
      }

      if (!values.service) errs.service = "Service requis.";
      if (forcedServiceInfo.shouldForce && !forcedServiceValue) {
        errs.service = `Le service ${forcedServiceInfo.expectedService} n'existe pas dans la base.`;
      } else if (forcedServiceValue && values.service !== forcedServiceValue) {
        errs.service = `Ce grade doit être affecté au service ${forcedServiceValue}.`;
      }

      if (!values.adresse.trim()) errs.adresse = "Adresse requise.";
      return errs;
    },
    [serviceOptions]
  );

  const buildPassword = useCallback(() => {
    const prenomPart = (form.prenom || "").replace(/[^A-Za-z]/g, "").slice(0, 2).toLowerCase();
    const nomPart = (form.nom || "").replace(/[^A-Za-z]/g, "").slice(0, 2).toLowerCase();
    const tokenBase = prenomPart + nomPart || "user";
    return `CLI${tokenBase}@2026`;
  }, [form.prenom, form.nom]);

  const openCreate = useCallback(() => {
    setModalMode("create");
    setEditMatricule(null);
    setOriginalContract(null);
    setOriginalGrade("");
    setGeneratedPwd("");
    setAutoGeneratePwd(false);
    setActionError("");
    setSuccessMessage("");
    closeSuccessModal();

    const defaultGradeList = (gradeOptions.medecin || []).filter((g) => !isChefServiceGrade(g.label));
    const defaultGrade = defaultGradeList[0]
      ? { grade: defaultGradeList[0].label, gradeId: defaultGradeList[0].id }
      : getFirstGradeForRole("medecin");

    setForm({
      ...buildDefaultForm(),
      grade: defaultGrade.grade,
      gradeId: defaultGrade.gradeId,
      roleCategory: "medecin",
      contract: CONTRACT_OPTIONS[0],
      service: serviceOptions[0] || "",
    });
    setFormErrors({});
    setShowModal(true);
  }, [closeSuccessModal, getFirstGradeForRole, gradeOptions.medecin, serviceOptions]);

  const openEdit = useCallback(
    (row) => {
      if (!row) return;
      setModalMode("edit");
      setEditMatricule(row.matricule);
      setOriginalContract(row.type_contrat || "");
      setGeneratedPwd("");
      setAutoGeneratePwd(false);
      setActionError("");
      setSuccessMessage("");
      closeSuccessModal();

      const gradeIdFromRow = row.id_grade ? Number(row.id_grade) || null : null;
      const gradeFromOptions = gradeIdFromRow ? findGradeByValue(gradeIdFromRow) : findGradeByValue(row.grade);
      const detectedRole = gradeFromOptions?.categorie || detectRoleByGrade(row.grade);
      const allowedGrades = gradeOptions[detectedRole] || [];
      const fallbackGrade = getFirstGradeForRole(detectedRole || "medecin");
      const safeGrade = gradeFromOptions?.label || row.grade || allowedGrades[0]?.label || fallbackGrade.grade || "";
      setOriginalGrade(safeGrade);
      const safeGradeId =
        gradeFromOptions?.id ||
        allowedGrades.find((g) => g.label === row.grade)?.id ||
        gradeIdFromRow ||
        fallbackGrade.gradeId;

      const policyForEdit = resolveContractPolicy({
        roleKey: detectedRole || "medecin",
        gradeLabel: safeGrade,
        mode: "edit",
      });
      const currentContractType = getContractTypeKey(row.type_contrat || "");
      const nextContract = policyForEdit.forcedType
        ? getContractLabelByType(policyForEdit.forcedType)
        : policyForEdit.allowedTypes.includes(currentContractType)
          ? row.type_contrat || CONTRACT_OPTIONS[0]
          : getContractLabelByType(policyForEdit.allowedTypes[0]) || CONTRACT_OPTIONS[0];

      const forcedEditService = resolveForcedServiceForGrade(safeGrade, serviceOptions).forcedService;
      const selectedService = forcedEditService || row.service || serviceOptions[0] || "";
      ensureServiceOption(selectedService);

      setForm({
        matricule: row.matricule || "",
        prenom: normalizeNameInput(row.prenom || ""),
        nom: normalizeNameInput(row.nom || ""),
        email: row.email || "",
        cin: (row.cin || "").replace(/\D/g, "").slice(0, 8),
        hireDate: row.date_embauche ? asLocalISODate(row.date_embauche) : "",
        password: "",
        contract: nextContract,
        roleCategory: normalizeCategory(detectedRole, "medecin"),
        grade: safeGrade,
        gradeId: safeGradeId || null,
        service: selectedService,
        phone: (row.num_telephone || row.phone || "").replace(/\D/g, "").slice(0, 8),
        adresse: row.adresse || "",
      });

      setFormErrors({});
      setShowModal(true);
    },
    [closeSuccessModal, ensureServiceOption, findGradeByValue, getFirstGradeForRole, gradeOptions, serviceOptions]
  );

  const confirmDelete = useCallback(
    (row) => {
      if (!row) return;
      setDeleteTarget(row);
      setActionError("");
      setSuccessMessage("");
      closeSuccessModal();
      setShowDeleteModal(true);
    },
    [closeSuccessModal]
  );

  const handleToggleAutoPwd = useCallback(() => {
    setAutoGeneratePwd((prev) => {
      const next = !prev;
      if (next) {
        const generated = buildPassword();
        setGeneratedPwd(generated);
        setForm((current) => ({ ...current, password: generated }));
      } else {
        setGeneratedPwd("");
        setForm((current) => ({ ...current, password: "" }));
      }
      return next;
    });
  }, [buildPassword]);

  const handleRoleChange = useCallback(
    (roleKey) => {
      if (modalMode === "edit") return;
      const gradesForRole = gradeOptions[roleKey] || [];
      const currentMatch = gradesForRole.find((g) => g.label === form.grade);
      const nextGradeOpt = currentMatch || gradesForRole[0] || null;
      const nextGrade = nextGradeOpt?.label || "";

      const forcedNextService = resolveForcedServiceForGrade(nextGrade, serviceOptions).forcedService;
      const nextContractPolicy = resolveContractPolicy({
        roleKey,
        gradeLabel: nextGrade,
        mode: modalMode,
      });

      const paramedicalServiceOptions = resolveParamedicalServiceOptions(serviceOptions);
      const blocked = new Set(paramedicalServiceOptions.map((name) => normalizeLoose(name)));
      const nonParamedicalServiceOptions = serviceOptions.filter((name) => !blocked.has(normalizeLoose(name)));

      const nextRoleServices =
        roleKey === "paramedical" && paramedicalServiceOptions.length
          ? paramedicalServiceOptions
          : roleKey !== "paramedical" && nonParamedicalServiceOptions.length
            ? nonParamedicalServiceOptions
            : serviceOptions;

      const fallbackService =
        nextRoleServices.includes(form.service) ? form.service : nextRoleServices[0] || form.service;

      setForm((prev) => {
        const prevContractType = getContractTypeKey(prev.contract);
        const nextContract = nextContractPolicy.forcedType
          ? getContractLabelByType(nextContractPolicy.forcedType)
          : nextContractPolicy.allowedTypes.includes(prevContractType)
            ? prev.contract
            : getContractLabelByType(nextContractPolicy.allowedTypes[0]) || prev.contract;

        return {
          ...prev,
          roleCategory: roleKey,
          grade: nextGrade,
          gradeId: nextGradeOpt?.id || null,
          contract: nextContract,
          service: forcedNextService || fallbackService,
        };
      });
    },
    [form.grade, form.service, gradeOptions, modalMode, serviceOptions]
  );

  const forcedServiceInfo = useMemo(
    () => resolveForcedServiceForGrade(form.grade, serviceOptions),
    [form.grade, serviceOptions]
  );
  const forcedService = forcedServiceInfo.forcedService;

  const contractPolicy = useMemo(
    () =>
      resolveContractPolicy({
        roleKey: form.roleCategory,
        gradeLabel: form.grade,
        mode: modalMode,
      }),
    [form.roleCategory, form.grade, modalMode]
  );

  const originalContractType = getContractTypeKey(originalContract || "");
  const isEditCddLocked = modalMode === "edit" && originalContractType === "cdd";
  const forcedContract = contractPolicy.forcedType ? getContractLabelByType(contractPolicy.forcedType) : null;
  const allowedContractTypes = contractPolicy.allowedTypes;

  const paramedicalServiceOptions = useMemo(
    () => resolveParamedicalServiceOptions(serviceOptions),
    [serviceOptions]
  );

  const nonParamedicalServiceOptions = useMemo(() => {
    if (!paramedicalServiceOptions.length) return serviceOptions;
    const blocked = new Set(paramedicalServiceOptions.map((name) => normalizeLoose(name)));
    const filtered = serviceOptions.filter((name) => !blocked.has(normalizeLoose(name)));
    return filtered.length ? filtered : serviceOptions;
  }, [serviceOptions, paramedicalServiceOptions]);

  const getServiceOptionsForRole = useCallback(
    (roleKey) => {
      if (roleKey === "paramedical" && paramedicalServiceOptions.length) return paramedicalServiceOptions;
      if (roleKey !== "paramedical" && nonParamedicalServiceOptions.length) return nonParamedicalServiceOptions;
      return serviceOptions;
    },
    [paramedicalServiceOptions, nonParamedicalServiceOptions, serviceOptions]
  );

  const roleScopedServiceOptions = useMemo(
    () => getServiceOptionsForRole(form.roleCategory),
    [form.roleCategory, getServiceOptionsForRole]
  );

  const serviceOptionsForForm = useMemo(() => {
    if (forcedService) return [forcedService];
    const shouldHideGeneralService =
      modalMode === "create" && !isStagiaireGrade(form.grade) && resolveMedecinGradeKey(form.grade) !== "generaliste";
    if (!shouldHideGeneralService) return roleScopedServiceOptions;
    return roleScopedServiceOptions.filter((serviceName) => !isMedecineGeneraleService(serviceName));
  }, [forcedService, roleScopedServiceOptions, modalMode, form.grade]);

  const availableGrades = useMemo(() => {
    const base = gradeOptions[form.roleCategory] || [];
    const hasCurrent = form.grade && base.some((g) => g.label === form.grade);
    if (hasCurrent) return base;
    return form.grade ? [...base, { id: form.gradeId || null, label: form.grade, categorie: form.roleCategory }] : base;
  }, [gradeOptions, form.roleCategory, form.grade, form.gradeId]);

  const handleGradeChange = useCallback(
    (nextValue) => {
      if (modalMode === "edit" && form.roleCategory === "paramedical") return;
      const selected = findGradeByValue(nextValue, form.roleCategory);
      const nextGrade = selected?.label || String(nextValue || "");

      if (modalMode === "edit") {
        const transition = validateGradeTransition({
          roleKey: form.roleCategory,
          fromGrade: originalGrade,
          toGrade: nextGrade,
        });
        if (!transition.ok) {
          setFormErrors((prev) => ({ ...prev, grade: transition.message || "Transition invalide." }));
          return;
        }
      }

      const nextContractPolicy = resolveContractPolicy({
        roleKey: form.roleCategory,
        gradeLabel: nextGrade,
        mode: modalMode,
      });
      const prevContractType = getContractTypeKey(form.contract);
      const nextContract = nextContractPolicy.forcedType
        ? getContractLabelByType(nextContractPolicy.forcedType)
        : nextContractPolicy.allowedTypes.includes(prevContractType)
          ? form.contract
          : getContractLabelByType(nextContractPolicy.allowedTypes[0]) || form.contract;

      const forcedNextService = resolveForcedServiceForGrade(nextGrade, serviceOptions).forcedService;

      setFormErrors((prev) => {
        const copy = { ...prev };
        delete copy.grade;
        delete copy.service;
        delete copy.contract;
        return copy;
      });

      setForm((prev) => ({
        ...prev,
        grade: nextGrade,
        gradeId: selected?.id ?? null,
        contract: nextContract,
        service: forcedNextService || prev.service,
      }));
    },
    [findGradeByValue, form.contract, form.roleCategory, modalMode, originalGrade, serviceOptions]
  );

  useEffect(() => {
    if (!forcedService) return;
    if (form.service && form.service === forcedService) return;
    setForm((prev) => ({ ...prev, service: forcedService }));
  }, [forcedService, form.service]);

  useEffect(() => {
    if (!contractPolicy.forcedType) return;
    const next = getContractLabelByType(contractPolicy.forcedType);
    if (next && next !== form.contract) setForm((prev) => ({ ...prev, contract: next }));
  }, [contractPolicy.forcedType, form.contract]);

  const handleSubmit = useCallback(
    async (event) => {
      event?.preventDefault?.();
      const mode = modalMode;
      const values = {
        ...form,
        prenom: normalizeNameInput(form.prenom),
        nom: normalizeNameInput(form.nom),
        email: (form.email || "").trim(),
        adresse: (form.adresse || "").trim(),
      };

      const errs = validate(values, mode);
      if (Object.keys(errs).length) {
        setFormErrors(errs);
        return;
      }

      const forcedServiceInfo = resolveForcedServiceForGrade(values.grade, serviceOptions);
      const forcedServiceValue = forcedServiceInfo.forcedService;
      const serviceValue = forcedServiceInfo.shouldForce ? forcedServiceValue : values.service;

      if (forcedServiceInfo.shouldForce && !forcedServiceValue) {
        setFormErrors((prev) => ({
          ...prev,
          service: `Le service ${forcedServiceInfo.expectedService} n'existe pas dans la base.`,
        }));
        return;
      }

      try {
        setSaving(true);
        setActionError("");
        setSuccessMessage("");

        const endpoint =
          mode === "create"
            ? `${API_BASE_URL}/api/personnel`
            : `${API_BASE_URL}/api/personnel/${encodeURIComponent(editMatricule)}`;
        const method = mode === "create" ? "POST" : "PUT";

        const gradeSelected = findGradeByValue(values.gradeId || values.grade, values.roleCategory);

        const payload = {
          matricule: values.matricule,
          prenom: values.prenom,
          nom: values.nom,
          email: values.email,
          cin: values.cin,
          num_telephone: values.phone,
          service: serviceValue,
          grade: gradeSelected?.label || values.grade,
          id_grade: gradeSelected?.id || values.gradeId || null,
          categorie: normalizeCategory(values.roleCategory),
          type_contrat: values.contract,
          date_embauche: values.hireDate,
          adresse: values.adresse,
          password: mode === "create" ? values.password : values.password || undefined,
        };

        const resp = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          if (data.fieldMessages && Object.keys(data.fieldMessages).length > 0) {
            const errorObj = new Error(data.message || "Erreur de validation");
            errorObj.isFieldError = true;
            errorObj.fieldMessages = data.fieldMessages;
            throw errorObj;
          }
          throw new Error(data.message || "Erreur serveur");
        }

        await reloadList();
        setShowModal(false);
        setSuccessModal({
          open: true,
          title: mode === "create" ? "Personnel Ajouté" : "Personnel Modifié",
          body: mode === "create" ? "Le personnel a été ajouté avec succès." : "Le personnel a été modifié avec succès.",
        });
      } catch (er) {
        if (er.isFieldError) {
          setFormErrors(er.fieldMessages);
          setActionError("");
        } else {
          setActionError(er.message || "Erreur serveur"); setTimeout(() => setActionError(""), 4000);
        }
      } finally {
        setSaving(false);
      }
    },
    [editMatricule, findGradeByValue, form, modalMode, reloadList, serviceOptions, validate]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget?.matricule) {
      setShowDeleteModal(false);
      return;
    }
    try {
      setSaving(true);
      const resp = await fetch(`${API_BASE_URL}/api/personnel/${encodeURIComponent(deleteTarget.matricule)}`, {
        method: "DELETE",
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.message || "Suppression impossible");
      await reloadList();
      const fullName = [deleteTarget.prenom, deleteTarget.nom].filter(Boolean).join(" ").trim() || "Ce personnel";
      setSuccessModal({
        open: true,
        title: "Personnel Supprimé",
        body: `Le personnel ${fullName} a été supprimé avec succès.`,
      });
    } catch (er) {
      setActionError(er.message || "Erreur serveur"); setTimeout(() => setActionError(""), 4000);
    } finally {
      setSaving(false);
      setShowDeleteModal(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, reloadList]);

  const createModalProps = {
    open: showModal && modalMode === "create",
    onClose: closePersonnelModal,
    onSubmit: handleSubmit,
    form,
    setForm,
    formErrors,
    roleOptions: ROLE_OPTIONS,
    onRoleChange: handleRoleChange,
    gradesLoading,
    availableGrades,
    onGradeChange: handleGradeChange,
    forcedService,
    forcedServiceInfo,
    serviceOptionsForForm,
    contractOptions: CONTRACT_OPTIONS,
    isEditCddLocked,
    forcedContract,
    allowedContractTypes,
    getContractTypeKey,
    contractPolicy,
    todayISO,
    autoGeneratePwd,
    onToggleAutoPwd: handleToggleAutoPwd,
    generatedPwd,
    setAutoGeneratePwd,
    setGeneratedPwd,
    saving,
  };

  const editModalProps = {
    ...createModalProps,
    open: showModal && modalMode === "edit",
    autoGeneratePwd: false,
    onToggleAutoPwd: () => {},
    generatedPwd: "",
    setAutoGeneratePwd: () => {},
    setGeneratedPwd: () => {},
  };

  const deleteModalProps = {
    open: showDeleteModal,
    target: deleteTarget,
    onClose: () => setShowDeleteModal(false),
    onConfirm: handleDelete,
    saving,
  };

  return {
    openCreate,
    openEdit,
    confirmDelete,
    saving,
    actionError,
    successMessage,
    createModalProps,
    editModalProps,
    deleteModalProps,
    successModal,
    closeSuccessModal,
  };
}

function FilterSelect({
  value,
  onChange,
  options,
  ariaLabel,
  allLabel,
  allValue,
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const normalizedOptions = useMemo(() => {
    if (!Array.isArray(options)) return [];
    return options
      .map((opt) => {
        if (opt && typeof opt === "object") return { value: String(opt.value), label: String(opt.label) };
        return { value: String(opt), label: String(opt) };
      })
      .filter((opt) => opt.label);
  }, [options]);

  const normalizedValue = value === null || value === undefined ? "" : String(value);
  const normalizedAllValue = allValue === null || allValue === undefined ? "" : String(allValue);

  const selectedLabel = useMemo(() => {
    if (normalizedValue === normalizedAllValue) return allLabel || "--";
    const found = normalizedOptions.find((opt) => opt.value === normalizedValue);
    return found?.label || allLabel || "--";
  }, [allLabel, normalizedAllValue, normalizedOptions, normalizedValue]);

  useEffect(() => {
    if (!open) return undefined;
    const handleDocMouseDown = (event) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleDocMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);
  //ybadel lvaleur wyssaker 
  const commit = (next) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`admin-filter-wrap ${className}`.trim()}>
      <button
        type="button"
        className={`admin-filter-trigger${open ? " open" : ""}`}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className="admin-filter-trigger-label">{selectedLabel}</span>
      </button>
      {open ? (
        <div className="admin-filter-menu" role="listbox" aria-label={ariaLabel}>
          <div className="admin-filter-menu-head">{selectedLabel}</div>
          <div className="admin-filter-menu-scroll">
            {normalizedValue === normalizedAllValue ? null : (
              <button
                type="button"
                className="admin-filter-option"
                onClick={() => commit(normalizedAllValue)}
                role="option"
                aria-selected={false}
              >
                {allLabel}
              </button>
            )}
            {normalizedOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`admin-filter-option${opt.value === normalizedValue ? " active" : ""}`}
                onClick={() => commit(opt.value)}
                role="option"
                aria-selected={opt.value === normalizedValue}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
export default function PersonnelPage() {
  const [serviceOptions, setServiceOptions] = useState([]);
  const [gradeOptions, setGradeOptions] = useState(() => ({ ...EMPTY_GRADE_OPTIONS }));
  const [gradesLoading, setGradesLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    search: "",
    service: "",
    grade: "",
    contract: "",
  });

  const loadList = async () => {
    try {
      setLoading(true);
      setError("");
      const resp = await fetch(`${API_BASE_URL}/api/personnel`);
      const data = await resp.json().catch(() => []);
      if (!resp.ok) {
        throw new Error(data?.message || "Chargement impossible.");
      }
      const safeData = data || [];
      setAllRows(safeData);
      const hasActiveFilters = Object.values(filters).some(Boolean);
      setRows(hasActiveFilters ? filterData(safeData) : safeData);
    } catch (e) {
      setError(e.message || "Erreur serveur"); setTimeout(() => setError(""), 4000);
      setAllRows([]);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const loadServices = async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/services`);
      const data = await resp.json().catch(() => []);
      if (Array.isArray(data)) {
        const names = data
          .map((s) => s.service || s.nom_service || s.nom || "")
          .map((s) => s.trim())
          .filter(Boolean);
        const uniqueNames = Array.from(new Set(names));
        setServiceOptions(uniqueNames);
      } else {
        setServiceOptions([]);
      }
    } catch {
      setServiceOptions([]);
    }
  };

  const toGradeOption = (item) => {
    if (!item) return null;
    const label = item.type_de_grade || item.label || item.nom || item.type || "";
    if (!label) return null;
    const id = item.id_grade ?? item.id ?? null;
    const categorie = normalizeCategory(item.categorie || item.category || detectRoleByGrade(label));
    const salaire = item.salaire ?? item.salary ?? null;
    return { id, label, categorie, salaire };
  };

  const buildGroupedGrades = (items = []) => {
    const grouped = { medecin: [], infirmier: [], paramedical: [], autre: [] };
    items.forEach((item) => {
      const opt = toGradeOption(item);
      if (!opt) return;
      const cat = normalizeCategory(opt.categorie, "medecin");
      const bucket = grouped[cat] || grouped.autre;
      const exists = bucket.some((g) => g.label === opt.label);
      if (!exists) bucket.push({ ...opt, categorie: cat });
    });

    // Infirmier : seulement 2 types (Infirmier / Stagiaire)
    const infirmierBucket = Array.isArray(grouped.infirmier) ? grouped.infirmier : [];
    const infirmierOptCandidates = infirmierBucket.filter((g) => g && !isStagiaireGrade(g.label));
    const stagiaireOptCandidates = infirmierBucket.filter((g) => g && isStagiaireGrade(g.label));
    const pickLowestId = (list) =>
      list
        .slice()
        .sort((a, b) => Number(a?.id ?? 0) - Number(b?.id ?? 0))
        .find(Boolean) || null;
    const infirmierOpt = pickLowestId(infirmierOptCandidates);
    const stagiaireOpt = pickLowestId(stagiaireOptCandidates);
    grouped.infirmier = [
      infirmierOpt ? { ...infirmierOpt, label: "Infirmier", categorie: "infirmier" } : null,
      stagiaireOpt ? { ...stagiaireOpt, label: STAGIAIRE_LABEL, categorie: "infirmier" } : null,
    ].filter(Boolean);

    ROLE_KEYS.forEach((key) => {
      if (!grouped[key]) grouped[key] = [];
    });
    return grouped;
  };

  const loadGrades = async () => {
    try {
      setGradesLoading(true);
      const resp = await fetch(`${API_BASE_URL}/api/grades`);
      const data = await resp.json().catch(() => []);
      if (!resp.ok) {
        throw new Error(data?.message || "Chargement des grades impossible.");
      }
      const grouped = buildGroupedGrades(Array.isArray(data) ? data : []);
      setGradeOptions(grouped);
    } catch {
      setGradeOptions({ ...EMPTY_GRADE_OPTIONS });
    } finally {
      setGradesLoading(false);
    }
  };

  useEffect(() => {
    loadList();
    loadServices();
    loadGrades();
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(""), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  const filterData = (data, currentFilters = filters) => {
    const q = currentFilters.search.trim();
    return data.filter((row) => {
      const rowCin = `${row.cin || ""}`.replace(/\D/g, "");
      const matchesSearch = !q || rowCin === q;
      const matchesService = !currentFilters.service || row.service === currentFilters.service;
      const matchesGrade = !currentFilters.grade || row.grade === currentFilters.grade;
      const matchesContract = !currentFilters.contract || row.type_contrat === currentFilters.contract;
      return matchesSearch && matchesService && matchesGrade && matchesContract;
    });
  };
 
  const applyFilters = () => {
    setRows(filterData(allRows));
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setFilters({ search: "", service: "", grade: "", contract: "" });
    if (allRows.length) {
      setRows(allRows);
    } else {
      loadList();
    }
    setCurrentPage(1);
  };

  const allGradeOptions = Object.values(gradeOptions).flat();
  const allGradeLabels = Array.from(new Set(allGradeOptions.map((g) => g.label).filter(Boolean)));
  const gradeById = useMemo(
    () =>
      new Map(
        allGradeOptions
          .filter((g) => g.id !== null && g.id !== undefined)
          .map((g) => [String(g.id), g])
      ),
    [allGradeOptions]
  );
  const gradeByLabel = useMemo(
    () =>
      new Map(
        allGradeOptions
          .filter((g) => g.label)
          .map((g) => [normalizeLoose(g.label), g])
      ),
    [allGradeOptions]
  );

  const resolveSalaryForRow = (emp) => {
    const idKey = String(emp?.id_grade ?? "").trim();
    if (idKey && gradeById.has(idKey)) return gradeById.get(idKey)?.salaire ?? null;
    const labelKey = normalizeLoose(emp?.grade || "");
    if (labelKey && gradeByLabel.has(labelKey)) return gradeByLabel.get(labelKey)?.salaire ?? null;
    return null;
  };

  const formatSalary = (value) => {
    if (value === null || value === undefined || value === "") return "—";
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value);
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(num);
  };

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageStartIndex = (currentPage - 1) * PAGE_SIZE;
  const pageEndIndex = pageStartIndex + PAGE_SIZE;
  const paginatedRows = rows.slice(pageStartIndex, pageEndIndex);
  const displayStart = rows.length === 0 ? 0 : pageStartIndex + 1;
  const displayEnd = rows.length === 0 ? 0 : Math.min(pageEndIndex, rows.length);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);


  const crudModals = usePersonnelCrudModals({
    serviceOptions,
    setServiceOptions,
    gradeOptions,
    gradesLoading,
    reloadList: loadList,
  });

  return (
    <div className="admin-card personnel-surface">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="personnel-page-title-wrap">
          <span className="personnel-page-title-line" aria-hidden="true" />
          <div>
            <h3 className="personnel-page-title mb-1">Gestion du Personnel</h3>
            <div className="personnel-page-subtitle">Suivi des profils, contrats.</div>
          </div>
        </div>
        <button className="btn admin-accent-btn shadow-sm" onClick={crudModals.openCreate}>
          + Ajouter Personnel
        </button>
      </div>

      <div className="filters-card mb-3">
        <div className="filter-bar">
          <input
            type="text"
            inputMode="numeric"
            className="form-control"
            placeholder="Rechercher par CIN (8 chiffres)"
            maxLength={8}
            value={filters.search}
            onChange={(e) =>
              setFilters({ ...filters, search: (e.target.value || "").replace(/\D/g, "").slice(0, 8) })
            }
            onKeyDown={(e) => {
              const allowed = ["Backspace", "Tab", "ArrowLeft", "ArrowRight", "Delete", "Home", "End"];
              if (!/[0-9]/.test(e.key) && !allowed.includes(e.key)) e.preventDefault();
            }}
            onPaste={(e) => {
              e.preventDefault();
              const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 8);
              setFilters((prev) => ({ ...prev, search: digits }));
            }}
          />
          <FilterSelect
            value={filters.service}
            onChange={(next) => setFilters({ ...filters, service: next })}
            options={serviceOptions}
            allLabel="Tous les services"
            allValue=""
            ariaLabel="Filtre service"
          />
          <FilterSelect
            value={filters.grade}
            onChange={(next) => setFilters({ ...filters, grade: next })}
            options={allGradeLabels}
            allLabel="Tous les grades"
            allValue=""
            ariaLabel="Filtre grade"
          />
          <FilterSelect
            value={filters.contract}
            onChange={(next) => setFilters({ ...filters, contract: next })}
            options={CONTRACT_OPTIONS}
            allLabel="Tous les contrats"
            allValue=""
            ariaLabel="Filtre contrat"
          />
          <button className="btn admin-accent-btn filter-btn" onClick={applyFilters}>
            Filtrer
          </button>
          <button className="btn btn-outline-secondary filter-btn reset-btn" onClick={resetFilters}>
            Réinitialiser
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger services-alert mb-2">{error}</div>}
      {crudModals.actionError && (
        <div className="alert alert-danger services-alert mb-2">{crudModals.actionError}</div>
      )}
      {crudModals.successMessage && (
        <div className="alert alert-success services-alert mb-2">{crudModals.successMessage}</div>
      )}

      <div className="personnel-table personnel-table-fixed">
        <table className="table align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Nom</th>
              <th>Grade</th>
              <th>Salaire</th>
              <th>Service</th>
              <th>CIN</th>
              <th>Date d'embauche</th>
              <th>Type de contrat</th>
              <th className="services-col-actions-head">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="text-center text-muted py-3">
                  Chargement...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted py-3">
                  Aucun personnel trouvé.
                </td>
              </tr>
            )}
            {!loading &&
              paginatedRows.map((emp, idx) => (
                <tr
                  key={emp.matricule || idx}
                >
                  <td>
                    <div className="d-flex align-items-center">
                      <div className="avatar-circle me-2">{initials(`${emp.prenom || ""} ${emp.nom || ""}`)}</div>
                      <div className="fw-semibold">
                        {[emp.prenom, emp.nom].filter(Boolean).join(" ") || "—"}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge-soft blue">{emp.grade || emp.role || "—"}</span>
                  </td>
                  <td>{formatSalary(resolveSalaryForRow(emp))}</td>
                  <td>{emp.service || "—"}</td>
                  <td>{emp.cin || "—"}</td>
                  <td>{displayDate(emp.date_embauche)}</td>
                  <td>
                    <span className="badge bg-light text-dark">{emp.type_contrat || "—"}</span>
                  </td>
                  <td className="services-col-actions text-center">
                    <div className="d-flex justify-content-center gap-2">
                      <button
                        className="btn btn-sm services-action-edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          crudModals.openEdit(emp);
                        }}
                      >
                        Modifier
                      </button>
                      <button
                        className="btn btn-sm services-action-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          crudModals.confirmDelete(emp);
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="d-flex justify-content-between align-items-center mt-3 text-muted small">
        <div>
          Afficher {displayStart} à {displayEnd} sur {rows.length} entrées
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            className="btn btn-sm btn-light"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          >
            Précédent
          </button>
          <span className="px-3 py-1 rounded bg-white border">{currentPage}</span>
          <button
            className="btn btn-sm btn-light"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
          >
            Suivant
          </button>
        </div>
      </div>

      <PersonnelCreateModal {...crudModals.createModalProps} />
      <PersonnelEditModal {...crudModals.editModalProps} />
      <PersonnelDeleteModal {...crudModals.deleteModalProps} />

      {crudModals.successModal?.open ? (
        <div className="modal-backdrop-soft" onClick={crudModals.closeSuccessModal}>
          <div className="modal-card success-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={crudModals.closeSuccessModal}>
              ×
            </button>
            <div className="d-flex align-items-start gap-3">
              <span className="success-icon" aria-hidden="true" />
              <div>
                <div className="modal-title text-success mb-1">{crudModals.successModal.title || "Succès"}</div>
                <div className="text-muted">{crudModals.successModal.body}</div>
              </div>
            </div>
            <div className="d-flex justify-content-end mt-3">
              <button className="btn btn-success btn-sm px-4" onClick={crudModals.closeSuccessModal}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}