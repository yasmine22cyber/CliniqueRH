import { useEffect, useMemo, useRef, useState } from "react";
import "../../admin/admin.css";
import PlanningCreateModal from "../components/PlanningCreateModal";
import { PlanningDeleteModal } from "../components/PlanningDeleteModal";
import PlanningRequestsModal from "../components/PlanningRequestsModal";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const getAuthHeaders = () => {
  const token = localStorage.getItem("authToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const FALLBACK_TYPE_OPTIONS = ["Matin", "Apres-midi", "Garde"];

const TYPE_PRESETS = {
  Matin: { start: "07:00", end: "14:00" },
  "Apres-midi": { start: "14:00", end: "19:00" },
  Garde: { start: "19:00", end: "07:00" },
};

const emptyForm = {
  matricule: "",
  service: "",
  date: "",
  endDate: "",
  startTime: "",
  endTime: "",
  type: FALLBACK_TYPE_OPTIONS[0],
  typeShiftId: "",
  notes: "",
  replaceChefService: false,
  replacementMatricule: "",
};

const dayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const toISO = (date) => {
  const pad = (val) => String(val).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const startOfWeek = (date) => {
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - day);
  base.setHours(0, 0, 0, 0);
  return base;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
// Format "Du 1 - 7 Jan" utilise lilcalendrier
const formatRange = (start, end) => {
  const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "short" });
  const startMonth = monthFmt.format(start);
  const endMonth = monthFmt.format(end);
  if (startMonth === endMonth) {
    return `Du ${start.getDate()} - ${end.getDate()} ${startMonth}`;
  }
  return `Du ${start.getDate()} ${startMonth} - ${end.getDate()} ${endMonth}`;
};

const normalizeDateValue = (value) => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return toISO(value);
  const str = String(value);
  return str.length >= 10 ? str.slice(0, 10) : str;
};

const normalizeLabel = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const resolveServiceValue = (person, services = []) => {
  if (!person) return "";
  const rawId = person.serviceId;
  if (rawId !== null && rawId !== undefined && rawId !== "")
    return String(rawId);
  const name = (person.serviceName || "").toString().trim();
  if (name) {
    const match = services.find(
      (opt) => opt.name && opt.name.toLowerCase() === name.toLowerCase(),
    );
    if (match && match.id !== null && match.id !== undefined)
      return String(match.id);
    return name;
  }
  return "";
};

const TYPE_CLASS = {
  matin: "matin",
  "apres-midi": "apres-midi",
  "apres midi": "apres-midi",
  garde: "nuit",
};

const getTypeClass = (value) => {
  const key = (value || "").toString().trim().toLowerCase();
  return TYPE_CLASS[key] || "default";
};

const isCongeType = (value) => {
  const raw = (value || "").toString().trim().toLowerCase();
  if (!raw) return false;
  return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === "conge";
};

// status ilifilhistorique colorii
const REQUEST_STATUS_TONES = {
  "En attente": "pending",
  Approuvé: "approved",
  Refusé: "refused",
  Annulé: "canceled",
};

const normalizeRequestStatus = (value = "") => {
  const normalized = value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (normalized.startsWith("approuv")) return "Approuvé";
  if (normalized.startsWith("refus")) return "Refusé";
  if (normalized.startsWith("annul")) return "Annulé";
  return "En attente";
};

const normalizeShiftKey = (value = "") =>
  value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeShiftLabel = (value = "") => {
  const raw = (value || "").toString().trim();
  if (!raw) return "";
  const key = normalizeShiftKey(raw);
  if (key.includes("apres")) return "Apres-midi";
  if (key.includes("garde")) return "Garde";
  if (key.includes("matin")) return "Matin";
  return raw;
};

const shiftKeyFromType = (value = "") => {
  const key = normalizeShiftKey(value);
  if (!key) return "";
  if (key.startsWith("matin")) return "matin";
  if (key.includes("apres")) return "apres-midi";
  if (key.includes("garde")) return "garde";
  return key;
};

const mapRequestShiftToType = (value = "") => {
  const key = shiftKeyFromType(value);
  if (key === "apres-midi") return "Apres-midi";
  if (key === "garde") return "Garde";
  return "Matin";
};

const getGradeCategory = (value = "") => {
  const key = normalizeLabel(value);
  if (!key) return "";
  if (key.includes("chef de service")) return "chef_service";
  if (key.includes("infirmier")) return "infirmier";
  if (
    key.includes("medecin specialiste") ||
    (key.includes("medecin") && key.includes("specialiste")) ||
    key.includes("specialiste")
  )
    return "medecin_specialiste";
  if (
    key.includes("medecin interne") ||
    (key.includes("medecin") && key.includes("interne")) ||
    key.includes("interne")
  )
    return "medecin_interne";
  if (
    key.includes("medecin generaliste") ||
    key.includes("medecin general") ||
    (key.includes("medecin") && key.includes("generaliste")) ||
    key.includes("generaliste")
  )
    return "medecin_generaliste";
  if (key === "resident" || key.includes("resident")) return "resident";
  if (key === "senior" || key.includes("senior")) return "senior";
  if (key.includes("surveill") || key.includes("survaill")) return "senior";
  return "";
};

const isSurveillantGrade = (value = "") => {
  const key = normalizeLabel(value);
  return key.includes("surveill") || key.includes("survaill");
};

export default function PlanningAdminPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nightRestrictedKeys, setNightRestrictedKeys] = useState([]);
  const [personnelChoices, setPersonnelChoices] = useState([]);
  const [serviceOptions, setServiceOptions] = useState([]);
  const [shiftTypes, setShiftTypes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [previewEntry, setPreviewEntry] = useState(null);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [appliedType, setAppliedType] = useState("");
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date()));
  const [currentPage, setCurrentPage] = useState(1);
  const [rowDeleteTarget, setRowDeleteTarget] = useState(null);
  const [rowActionBusy, setRowActionBusy] = useState(false);

  //  Dropdowns (formulaires, filtres)
  const [personnelDropdownOpen, setPersonnelDropdownOpen] = useState(false);
  const personnelDropdownRef = useRef(null);
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(false);
  const serviceDropdownRef = useRef(null);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef(null);
  const [replacementDropdownOpen, setReplacementDropdownOpen] = useState(false);
  const replacementDropdownRef = useRef(null);
  const [filterTypeDropdownOpen, setFilterTypeDropdownOpen] = useState(false);
  const filterTypeDropdownRef = useRef(null);

  const [requestRows, setRequestRows] = useState([]); //liste des demandes
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestBusyId, setRequestBusyId] = useState(null);
  const [congesRows, setCongesRows] = useState([]);
  const pendingNavFocusRef = useRef(null);

  const minCreateDateIso = useMemo(() => toISO(addDays(new Date(), 1)), []);
  const nightRestrictedSet = useMemo(
    () => new Set(nightRestrictedKeys),
    [nightRestrictedKeys],
  );
  const typeOptions = useMemo(
    () =>
      shiftTypes.length
        ? shiftTypes.map((s) => s.label)
        : FALLBACK_TYPE_OPTIONS,
    [shiftTypes],
  );
  const typeIdByLabel = useMemo(() => {
    const map = new Map();
    (shiftTypes || []).forEach((s) => {
      const id = Number(s?.id);
      if (Number.isFinite(id) && id > 0 && s?.label)
        map.set(s.label, String(id));
    });
    return map;
  }, [shiftTypes]);

  const loadGradeRestrictions = async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/grades/restrictions`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setNightRestrictedKeys([]);
        return;
      }
      const night = Array.isArray(data?.night_restricted)
        ? data.night_restricted
        : [];
      setNightRestrictedKeys(
        night.map((v) => String(v || "").trim()).filter(Boolean),
      );
    } catch {
      setNightRestrictedKeys([]);
    }
  };

  const loadList = async () => {
    try {
      setLoading(true);
      setError("");
      const resp = await fetch(`${API_BASE_URL}/api/planning`, {
        headers: getAuthHeaders(),
      });
      const data = await resp.json().catch(() => []);
      if (!resp.ok) throw new Error(data?.message || "Chargement impossible.");
      const normalized = Array.isArray(data)
        ? data.map((row) => ({
            ...row,
            date: normalizeDateValue(row.date),
            date_fin: normalizeDateValue(row.date_fin || row.date),
          }))
        : [];
      setRows(normalized);
    } catch (err) {
      setError(err.message || "Erreur serveur.");
      setTimeout(() => setError(""), 4000);
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
        setServiceOptions(
          data
            .map((s) => ({
              id: s.id ?? s.id_service ?? null,
              name: (s.service || s.nom_service || s.nom || "").trim(),
            }))
            .filter((s) => s.name),
        );
      }
    } catch {
      setServiceOptions([]);
    }
  };

  const loadPersonnel = async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/personnel`);
      const data = await resp.json().catch(() => []);
      if (Array.isArray(data)) {
        setPersonnelChoices(
          data
            .map((p) => {
              const rawId = p.id_service ?? null;
              const parsedId =
                rawId === null || rawId === undefined || rawId === ""
                  ? null
                  : Number.isFinite(Number(rawId))
                    ? Number(rawId)
                    : null;
              return {
                matricule: (p.matricule || "").toString(),
                name:
                  `${p.prenom || ""} ${p.nom || ""}`.trim() ||
                  p.matricule ||
                  "",
                serviceName: (p.service || "").toString().trim(),
                serviceId: parsedId,
                grade: (p.grade || "").toString().trim(),
              };
            })
            .filter((p) => p.matricule),
        );
      }
    } catch {
      setPersonnelChoices([]);
    }
  };

  const loadShiftTypes = async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/planning/type-shift`);
      const data = await resp.json().catch(() => []);
      if (!resp.ok)
        throw new Error(data?.message || "Chargement shifts impossible.");
      const normalized = Array.isArray(data)
        ? data
            .map((row) => ({
              id: row.id ?? null,
              label: (row.type_shift || row.type || "").toString().trim(),
              hours: row.nb_heures ?? row.nbHeures ?? null,
            }))
            .filter((row) => row.label)
        : [];
      setShiftTypes(normalized);
    } catch {
      setShiftTypes([]);
    }
  };

  const loadRequests = async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/planning-requests/admin`, {
        headers: getAuthHeaders(),
      });
      const data = await resp.json().catch(() => []);
      if (!resp.ok)
        throw new Error(data?.message || "Chargement des demandes impossible.");
      setRequestRows(Array.isArray(data) ? data : []);
    } catch {
      setRequestRows([]);
    }
  };

  const loadCongesAdmin = async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/conges/admin`, {
        headers: getAuthHeaders(),
      });
      const data = await resp.json().catch(() => []);
      if (!resp.ok)
        throw new Error(data?.message || "Chargement congés impossible.");
      setCongesRows(Array.isArray(data) ? data : []);
    } catch {
      setCongesRows([]);
    }
  };

  const updateRequestStatus = async (requestId, nextStatus, callbacks = {}) => {
    if (!requestId) return;
    const targetRow =
      requestRows.find((row) => Number(row?.id) === Number(requestId)) || null;
    const requesterLabel =
      `${targetRow?.prenom || ""} ${targetRow?.nom || ""}`.trim() ||
      targetRow?.matricule ||
      "Personnel";
    const preferredDate = normalizeDateValue(targetRow?.date_preferee) || "--";
    const shiftLabel = normalizeShiftLabel(targetRow?.shift_type) || "--";
    try {
      setRequestBusyId(requestId);
      const resp = await fetch(
        `${API_BASE_URL}/api/planning-requests/${encodeURIComponent(requestId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ statut: nextStatus }),
        },
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.message || "Mise à jour impossible.");
      await loadRequests();
      await loadList();
      const statusLabel = normalizeRequestStatus(nextStatus);
      callbacks.onSuccess?.({
        requesterLabel,
        preferredDate,
        shiftLabel,
        statusLabel,
      });
    } catch (err) {
      callbacks.onError?.(err.message || "Erreur serveur.");
    } finally {
      setRequestBusyId(null);
    }
  };

  const createReplacementForRequest = async (
    row,
    replacementMatricule,
    callbacks = {},
  ) => {
    if (!row) return;
    const dateIso = normalizeDateValue(row.date_preferee);
    if (!dateIso) {
      callbacks.onError?.("Date préférée invalide.");
      return;
    }
    const requestedType = mapRequestShiftToType(row.shift_type);
    // Calcul des shifts courants pour le message de succès
    const currentShiftKey = (() => {
      const requesterMatricule = normalizeShiftKey
        ? String(row?.matricule || "")
            .replace(/\D/g, "")
            .padStart(10, "0")
        : "";
      if (!requesterMatricule || !dateIso) return "";
      const current = rows
        .filter(
          (r) =>
            String(r?.matricule || "")
              .replace(/\D/g, "")
              .padStart(10, "0") === requesterMatricule &&
            normalizeDateValue(r?.date) === dateIso,
        )
        .sort((a, b) =>
          String(a?.start_time || "").localeCompare(
            String(b?.start_time || ""),
          ),
        )[0];
      return shiftKeyFromType(current?.type || "");
    })();
    const currentShiftLabel =
      currentShiftKey === "apres-midi"
        ? "Apres-midi"
        : currentShiftKey === "garde"
          ? "Garde"
          : "Matin";
    const requesterLabel =
      `${row.prenom || ""} ${row.nom || ""}`.trim() ||
      row.matricule ||
      "Personnel";

    // Trouver le remplaçant parmi le personnel
    const replacement = personnelChoices.find(
      (p) =>
        String(p.matricule || "")
          .replace(/\D/g, "")
          .padStart(10, "0") ===
        String(replacementMatricule || "")
          .replace(/\D/g, "")
          .padStart(10, "0"),
    );

    try {
      setRequestBusyId(row.id);
      const statusResp = await fetch(
        `${API_BASE_URL}/api/planning-requests/${encodeURIComponent(row.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            statut: "Approuve",
            replacement_matricule: replacementMatricule,
          }),
        },
      );
      const statusData = await statusResp.json().catch(() => ({}));
      if (!statusResp.ok) {
        const msg = statusData?.message || "Validation impossible.";
        const pgCode = statusData?.meta?.pgCode
          ? String(statusData.meta.pgCode)
          : ""; //message: "Date invalide", meta: { pgCode: 101 } pgcode fiwisitmeta
        throw new Error(pgCode ? `${msg} (code ${pgCode})` : msg);
      }
      await loadList();
      await loadRequests();
      callbacks.onSuccess?.({
        requesterLabel,
        dateIso,
        currentShiftLabel,
        requestedType,
        replacementName: replacement?.name || replacementMatricule,
      });
    } catch (err) {
      callbacks.onError?.(err.message || "Erreur serveur.");
    } finally {
      setRequestBusyId(null);
    }
  };

  useEffect(() => {
    loadList();
    loadServices();
    loadPersonnel();
    loadShiftTypes();
    loadRequests();
    loadCongesAdmin();
    loadGradeRestrictions();
  }, []);

  // Navigation depuis sessionStorage (intent externe)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("nav_intent_v1");
      if (!raw) return;
      const intent = JSON.parse(raw);
      if (
        intent?.tab !== "emplois" ||
        intent?.action !== "openPlanningRequests"
      )
        return;
      pendingNavFocusRef.current = intent?.focusId ?? null;
      sessionStorage.removeItem("nav_intent_v1");
      setRequestModalOpen(true);
    } catch {
      // ignore
    }
  }, []);

  // Scroll vers la demande ciblée après ouverture du modal
  useEffect(() => {
    if (!requestModalOpen) return;
    const focusId = pendingNavFocusRef.current;
    if (!focusId) return;
    const el = document.getElementById(`admin-planning-request-${focusId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    pendingNavFocusRef.current = null;
  }, [requestModalOpen]);

  //   Effets formulaire
  useEffect(() => {
    if (showForm && !form.service && serviceOptions.length) {
      const first = serviceOptions[0];
      setForm((prev) => ({ ...prev, service: String(first.id ?? first.name) }));
    }
  }, [showForm, form.service, serviceOptions]);

  useEffect(() => {
    if (!showForm || !form.matricule || form.service) return;
    const selected = personnelChoices.find(
      (p) => p.matricule === form.matricule,
    );
    if (!selected) return;
    const preferredService = resolveServiceValue(selected, serviceOptions);
    if (preferredService)
      setForm((prev) => ({ ...prev, service: preferredService }));
  }, [
    showForm,
    form.matricule,
    form.service,
    personnelChoices,
    serviceOptions,
  ]);

  useEffect(() => {
    if (!showForm || !form.date || form.endDate) return;
    setForm((prev) => ({ ...prev, endDate: prev.date }));
  }, [showForm, form.date, form.endDate]);

  useEffect(() => {
    if (!showForm) return;
    const nextType = typeOptions.includes(form.type)
      ? form.type
      : typeOptions[0] || "";
    const nextTypeShiftId = typeIdByLabel.get(nextType) || "";
    const preset = TYPE_PRESETS[nextType];

    setForm((prev) => {
      const changedType = prev.type !== nextType;
      const changedId =
        String(prev.typeShiftId || "") !== String(nextTypeShiftId || "");
      const nextStart = preset?.start ?? prev.startTime;
      const nextEnd = preset?.end ?? prev.endTime;
      const changedTime =
        prev.startTime !== nextStart || prev.endTime !== nextEnd;
      if (!changedType && !changedId && !changedTime) return prev;
      return {
        ...prev,
        type: nextType,
        typeShiftId: nextTypeShiftId,
        startTime: nextStart,
        endTime: nextEnd,
      };
    });
  }, [showForm, typeOptions, typeIdByLabel, form.type]);

  //  Fermeture dropdowns au clic extérieur
  useEffect(() => {
    if (
      !personnelDropdownOpen &&
      !serviceDropdownOpen &&
      !typeDropdownOpen &&
      !replacementDropdownOpen &&
      !filterTypeDropdownOpen
    )
      return;
    const handleClickOutside = (event) => {
      const inside =
        (personnelDropdownRef.current &&
          personnelDropdownRef.current.contains(event.target)) ||
        (serviceDropdownRef.current &&
          serviceDropdownRef.current.contains(event.target)) ||
        (typeDropdownRef.current &&
          typeDropdownRef.current.contains(event.target)) ||
        (replacementDropdownRef.current &&
          replacementDropdownRef.current.contains(event.target)) ||
        (filterTypeDropdownRef.current &&
          filterTypeDropdownRef.current.contains(event.target));
      if (!inside) {
        setPersonnelDropdownOpen(false);
        setServiceDropdownOpen(false);
        setTypeDropdownOpen(false);
        setReplacementDropdownOpen(false);
        setFilterTypeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [
    personnelDropdownOpen,
    serviceDropdownOpen,
    typeDropdownOpen,
    replacementDropdownOpen,
    filterTypeDropdownOpen,
  ]);

  //creation des jours de la semaine al7aliyaa lilcalendrier
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, idx) => {
        const date = addDays(currentWeek, idx);
        return { date, iso: toISO(date), label: dayLabels[idx] };
      }),
    [currentWeek],
  );
  // Format "Du 1 - 7 Jan" utilise lilcalendrier
  const weekRangeLabel = useMemo(() => {
    const end = addDays(currentWeek, 6);
    return formatRange(currentWeek, end);
  }, [currentWeek]);

  const rowsInWeek = useMemo(() => {
    const startIso = toISO(currentWeek);
    const endIso = toISO(addDays(currentWeek, 6));
    return rows.filter((row) => row.date >= startIso && row.date <= endIso);
  }, [rows, currentWeek]);

  const personnelOptions = useMemo(() => {
    const map = new Map();
    const upsert = (key, name, matricule) => {
      if (!key) return;
      const cleanName = (name || "").toString().trim();
      const cleanMat = (matricule || "").toString().trim();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          name: cleanName || cleanMat || key,
          matricule: cleanMat,
        });
        return;
      }
      const next = { ...existing };
      if (!next.name && cleanName) next.name = cleanName;
      if (!next.matricule && cleanMat) next.matricule = cleanMat;
      map.set(key, next);
    };
    personnelChoices.forEach((person) =>
      upsert(person.matricule, person.name, person.matricule),
    );
    rowsInWeek.forEach((row) => {
      const key = (row.matricule || row.personnel || "").toString();
      upsert(key, row.personnel || row.matricule || "", row.matricule || "");
    });
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
    );
  }, [personnelChoices, rowsInWeek]);

  const filteredPersonnel = useMemo(() => {
    const q = appliedSearch.trim().toLowerCase();
    return personnelOptions.filter(
      (person) =>
        !q ||
        person.name.toLowerCase().includes(q) ||
        person.matricule.toLowerCase().includes(q),
    );
  }, [personnelOptions, appliedSearch]);
  //filtrer par type
  const filteredRows = useMemo(() => {
    if (!appliedType) return rowsInWeek;
    return rowsInWeek.filter((row) => row.type === appliedType);
  }, [rowsInWeek, appliedType]);

  // Compteur des demandes en attente
  const pendingRequestCount = useMemo(
    () =>
      requestRows.filter(
        (row) => normalizeRequestStatus(row.statut) === "En attente",
      ).length,
    [requestRows],
  );

  // tshouf lpersonnel 3ando demande et status mte3ha fi semaine actuelle
  const requestByMatriculeDate = useMemo(() => {
    const startIso = toISO(currentWeek);
    const endIso = toISO(addDays(currentWeek, 6));
    const map = new Map();
    requestRows.forEach((row) => {
      const matricule = (row?.matricule || "").toString().trim();
      if (!matricule) return;
      const dateIso = normalizeDateValue(row?.date_preferee);
      if (!dateIso || dateIso < startIso || dateIso > endIso) return;
      const statusLabel = normalizeRequestStatus(
        row?.statut || row?.status || "",
      );
      if (statusLabel !== "En attente" && statusLabel !== "Approuvé") return;
      const tone = REQUEST_STATUS_TONES[statusLabel] || "pending";
      const stamp =
        new Date(
          row?.updated_at || row?.created_at || row?.date_preferee || 0,
        ).getTime() || 0;
      const key = `${matricule}|${dateIso}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { row, tone, stamp, statusLabel });
        return;
      }
      const existingPriority = existing.tone === "approved" ? 2 : 1;
      const nextPriority = tone === "approved" ? 2 : 1;//priority lel approuver
      if (nextPriority > existingPriority || stamp > existing.stamp) {
        map.set(key, { row, tone, stamp, statusLabel });
      }
    });
    return map;
  }, [requestRows, currentWeek]);

  //  Pagination
  const PAGE_SIZE = 4;
  const totalPages = Math.max(
    1,
    Math.ceil(filteredPersonnel.length / PAGE_SIZE),
  );
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredPersonnel.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [appliedSearch, appliedType, currentWeek]);

  //  Infos personnel sélectionné (formulaire)
  const selectedPersonnelInfo = useMemo(
    () => personnelChoices.find((p) => p.matricule === form.matricule) || null,
    [form.matricule, personnelChoices],
  );

  const isNightRestricted = useMemo(() => {
    const gradeKey = normalizeLabel(selectedPersonnelInfo?.grade);
    return Boolean(gradeKey && nightRestrictedSet.has(gradeKey));
  }, [selectedPersonnelInfo, nightRestrictedSet]);
  //surveillant eli bsh y3awedh chef eneho shift eli bsh yekhdmo selon shift mta3 chef
  const isDayShiftForChefReplacement = useMemo(() => {
    const key = shiftKeyFromType(form.type || "");
    return key === "matin" || key === "apres-midi";
  }, [form.type]);

  const inverseShiftLabel = useMemo(() => {
    const key = shiftKeyFromType(form.type || "");
    if (key === "matin") return "Apres-midi";
    if (key === "apres-midi") return "Matin";
    return "";
  }, [form.type]);

  const isChefServiceSelected = useMemo(
    () =>
      getGradeCategory(selectedPersonnelInfo?.grade || "") === "chef_service",
    [selectedPersonnelInfo],
  );

  const preferredPersonnelService = useMemo(
    () => resolveServiceValue(selectedPersonnelInfo, serviceOptions),
    [selectedPersonnelInfo, serviceOptions],
  );

  const selectedServiceKeyForReplacement = useMemo(() => {
    const fromPerson = normalizeLabel(selectedPersonnelInfo?.serviceName || "");
    if (fromPerson) return fromPerson;
    if (!form.service) return "";
    const matched = serviceOptions.find(
      (opt) => String(opt.id ?? opt.name) === String(form.service),
    );
    return normalizeLabel(matched?.name || form.service || "");
  }, [selectedPersonnelInfo, form.service, serviceOptions]);
  //chkon inajam i3awath chef mais avec des condition
  const replacementCandidates = useMemo(() => {
    if (!isChefServiceSelected) return [];
    const selectedMatricule = String(form.matricule || "");
    return personnelChoices
      .filter((person) => {
        const matricule = String(person?.matricule || "");
        if (!matricule || matricule === selectedMatricule) return false;
        if (!isSurveillantGrade(person?.grade || "")) return false;
        if (selectedServiceKeyForReplacement) {
          const personServiceKey = normalizeLabel(person?.serviceName || "");
          if (
            !personServiceKey ||
            personServiceKey !== selectedServiceKeyForReplacement
          )
            return false;
        }
        return true;
      })
      .sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", "fr", {
          sensitivity: "base",
        }),
      );
  }, [
    isChefServiceSelected,
    form.matricule,
    personnelChoices,
    selectedServiceKeyForReplacement,
  ]);

  const isServiceLocked = true;
  //personnel kiyitbadal yitbadal service zada
  useEffect(() => {
    if (!showForm || !selectedPersonnelInfo || !preferredPersonnelService)
      return;
    if (String(form.service) === String(preferredPersonnelService)) return;
    setForm((prev) => ({ ...prev, service: preferredPersonnelService }));
  }, [
    showForm,
    selectedPersonnelInfo,
    preferredPersonnelService,
    form.service,
  ]);

  useEffect(() => {
    if (!showForm || !isNightRestricted) return;
    if (form.type !== "Garde") return;
    const preset = TYPE_PRESETS["Apres-midi"];
    setForm((prev) => ({
      ...prev,
      type: "Apres-midi",
      typeShiftId: typeIdByLabel.get("Apres-midi") || prev.typeShiftId,
      startTime: preset ? preset.start : prev.startTime,
      endTime: preset ? preset.end : prev.endTime,
    }));
  }, [showForm, isNightRestricted, form.type, typeIdByLabel]);

  useEffect(() => {
    if (!showForm) return;
    if (!isChefServiceSelected || !isDayShiftForChefReplacement) {
      if (replacementDropdownOpen) setReplacementDropdownOpen(false);
      if (form.replaceChefService || form.replacementMatricule) {
        setForm((prev) => ({
          ...prev,
          replaceChefService: false,
          replacementMatricule: "",
        }));
      }
      return;
    }
    if (!form.replaceChefService) {
      if (replacementDropdownOpen) setReplacementDropdownOpen(false);
      if (form.replacementMatricule)
        setForm((prev) => ({ ...prev, replacementMatricule: "" }));
      return;
    }
    const stillValid = replacementCandidates.some(
      (person) =>
        String(person.matricule) === String(form.replacementMatricule),
    );
    if (!stillValid) {
      setForm((prev) => ({
        ...prev,
        replacementMatricule: replacementCandidates[0]?.matricule || "",
      }));
    }
  }, [
    showForm,
    isChefServiceSelected,
    isDayShiftForChefReplacement,
    form.replaceChefService,
    form.replacementMatricule,
    replacementDropdownOpen,
    replacementCandidates,
  ]);

  const selectedFilterTypeLabel = useMemo(
    () => selectedType || "Type (Tous)",
    [selectedType],
  );

  const hasFixedTime =
    TYPE_PRESETS[form.type] !== undefined && TYPE_PRESETS[form.type] !== null;

  const openCreate = () => {
    setError("");
    setPersonnelDropdownOpen(false);
    setServiceDropdownOpen(false);
    setTypeDropdownOpen(false);
    setReplacementDropdownOpen(false);
    const firstPersonnel = personnelChoices[0];
    const first = serviceOptions[0];
    const preferredService = resolveServiceValue(
      firstPersonnel,
      serviceOptions,
    );
    const todayIso = toISO(new Date());
    const defaultType = typeOptions[0] || FALLBACK_TYPE_OPTIONS[0];
    const preset = TYPE_PRESETS[defaultType];
    setForm({
      ...emptyForm,
      matricule: firstPersonnel?.matricule || "",
      service:
        preferredService || (first ? String(first.id ?? first.name) : ""),
      date: todayIso,
      endDate: todayIso,
      type: defaultType,
      typeShiftId: typeIdByLabel.get(defaultType) || "",
      startTime: preset ? preset.start : "",
      endTime: preset ? preset.end : "",
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setError("");
    setShowForm(false);
    setForm(emptyForm);
    setPersonnelDropdownOpen(false);
    setServiceDropdownOpen(false);
    setTypeDropdownOpen(false);
    setReplacementDropdownOpen(false);
  };
  //handler ta3 les changements fi formulaire, ki yitbadal personnel yitbadal service automatiquement,ki yitbadal type yitbadal start et end
  const handleChange = (field, value) => {
    if (field === "matricule") {
      const selected = personnelChoices.find((p) => p.matricule === value);
      if (selected) {
        const preferredService = resolveServiceValue(selected, serviceOptions);
        setForm((prev) => ({
          ...prev,
          matricule: value,
          service: preferredService || prev.service,
        }));
        return;
      }
    }
    if (field === "type") {
      const preset = TYPE_PRESETS[value];
      const nextShiftId = typeIdByLabel.get(value) || "";
      setForm((prev) => ({
        ...prev,
        type: value,
        typeShiftId: nextShiftId,
        startTime: preset ? preset.start : prev.startTime,
        endTime: preset ? preset.end : prev.endTime,
      }));
      return;
    }
    if (field === "date") {
      setForm((prev) => ({
        ...prev,
        date: value,
        endDate: !prev.endDate || prev.endDate < value ? value : prev.endDate,
      }));
      return;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetFilters = () => {
    setSearch("");
    setSelectedType("");
    setAppliedSearch("");
    setAppliedType("");
    setFilterTypeDropdownOpen(false);
  };

  const applyFilters = () => {
    setAppliedSearch(search);
    setAppliedType(selectedType);
    setCurrentPage(1);
    setFilterTypeDropdownOpen(false);
  };

  const submitForm = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.date) {
      setError("Date invalide.");
      setTimeout(() => setError(""), 4000);
      return;
    }
    if (form.date < minCreateDateIso) {
      setError("La date debut doit etre a partir de demain.");
      setTimeout(() => setError(""), 4000);
      return;
    }
    const effectiveEndDate = form.endDate || form.date;
    if (effectiveEndDate && form.date && effectiveEndDate < form.date) {
      setError("Date fin doit etre apres date debut.");
      setTimeout(() => setError(""), 4000);
      return;
    }
    const selectedService = serviceOptions.find(
      (opt) =>
        String(opt.id) === String(form.service) ||
        String(opt.name).toLowerCase() === String(form.service).toLowerCase(),
    );
    const numericServiceId = Number.parseInt(String(form.service), 10);
    const resolvedServiceId =
      selectedService?.id ??
      (Number.isFinite(numericServiceId) && numericServiceId > 0
        ? numericServiceId
        : null);
    if (
      isChefServiceSelected &&
      isDayShiftForChefReplacement &&
      form.replaceChefService
    ) {
      if (!replacementCandidates.length) {
        setError(
          "Aucun Surveillant disponible dans ce service pour remplacement.",
        );
        setTimeout(() => setError(""), 4000);
        return;
      }
      if (!form.replacementMatricule) {
        setError("Selectionner un Surveillant remplaçant.");
        setTimeout(() => setError(""), 4000);
        return;
      }
      if (
        !replacementCandidates.some(
          (p) => String(p.matricule) === String(form.replacementMatricule),
        )
      ) {
        setError("Le remplaçant choisi n'est pas valide.");
        setTimeout(() => setError(""), 4000);
        return;
      }
    }
    const payload = {
      matricule: form.matricule,
      serviceId: resolvedServiceId,
      service: selectedService?.name || form.service,
      date: form.date,
      dateEnd: effectiveEndDate,
      endDate: effectiveEndDate,
      startTime: form.startTime,
      endTime: form.endTime,
      type: form.type,
      typeShiftId: form.typeShiftId,
      notes: form.notes,
    };
    if (
      isChefServiceSelected &&
      isDayShiftForChefReplacement &&
      form.replaceChefService
    ) {
      payload.replaceChefService = true;
      payload.replacementMatricule = form.replacementMatricule;
    }
    try {
      const resp = await fetch(`${API_BASE_URL}/api/planning`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(data?.message || "Echec de l'enregistrement.");
      if (form.date) {
        const focus = new Date(`${form.date}T00:00:00`);
        if (!Number.isNaN(focus.getTime())) setCurrentWeek(startOfWeek(focus));
      }
      await loadList();
      closeForm();
    } catch (err) {
      setError(err.message || "Erreur serveur.");
      setTimeout(() => setError(""), 4000);
    }
  };
  //tjib planning mta3 personnel
  const getRowEntries = (personKey) =>
    filteredRows
      .filter((row) => (row.matricule || row.personnel) === personKey)
      .sort((a, b) => {
        if (String(a.date) !== String(b.date))
          return String(a.date).localeCompare(String(b.date));
        return String(a.start_time).localeCompare(String(b.start_time));
      });
  //lmodal mta3 delete eli njibo fiha les planning
  const openRowDelete = (person) => {
    const entries = getRowEntries(person.key);
    if (!entries.length) {
      return;
    }
    setRowDeleteTarget({ person, entries });
  };

  const closeRowDelete = () => {
    if (rowActionBusy) return;
    setError("");
    setRowDeleteTarget(null);
  };

  const confirmRowDelete = async ({ mode, date } = {}) => {
    if (!rowDeleteTarget?.entries?.length) return;
    const deleteMode = mode === "day" ? "day" : "week";
    const selectedDay = normalizeDateValue(date);
    const entriesToDelete =
      deleteMode === "day"
        ? rowDeleteTarget.entries.filter(
            (e) => normalizeDateValue(e?.date) === selectedDay,
          )
        : rowDeleteTarget.entries;
    if (!entriesToDelete.length) {
      setError(
        "Selection invalide. Choisir un jour ou la suppression par semaine.",
      );
      setTimeout(() => setError(""), 4000);
      return;
    }
    try {
      setRowActionBusy(true);
      setError("");
      const failures = [];
      let deletedCount = 0;
      for (const entry of entriesToDelete) {
        const id = Number.parseInt(String(entry?.id ?? ""), 10);
        if (!Number.isInteger(id) || id <= 0) {
          failures.push("ID planning invalide.");
          continue;
        }
        const resp = await fetch(
          `${API_BASE_URL}/api/planning/${encodeURIComponent(id)}`,
          {
            method: "DELETE",
            headers: getAuthHeaders(),
          },
        );
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok)
          failures.push(data?.message || "Suppression ligne impossible.");
        else deletedCount += 1;
      }
      await loadList();
      if (failures.length) {
        const prefix = deletedCount
          ? `${deletedCount} planning(s) supprimé(s). `
          : "";
        setError(`${prefix}${failures.length} erreur(s): ${failures[0]}`);
        setTimeout(() => setError(""), 4000);
        return;
      }
      setRowDeleteTarget(null);
    } catch (err) {
      setError(err.message || "Erreur serveur.");
      setTimeout(() => setError(""), 4000);
    } finally {
      setRowActionBusy(false);
    }
  };

  // Handlers modal demandes
  const openRequestsModal = () => setRequestModalOpen(true);

  const closeRequestsModal = () => {
    if (requestBusyId) return;
    setRequestModalOpen(false);
  };
  //lildetail
  const openPreview = (entry) => setPreviewEntry(entry);
  const closePreview = () => setPreviewEntry(null);

  const getEntries = (personKey, dateIso) =>
    filteredRows
      .filter(
        (row) =>
          (row.matricule || row.personnel) === personKey &&
          row.date === dateIso,
      )
      .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));

  return (
    <div className="admin-card emplois-page">
      <div className="emplois-header">
        <div className="personnel-page-title-wrap">
          <span className="personnel-page-title-line" aria-hidden="true" />
          <div>
            <h3 className="personnel-page-title mb-1">
              Gestion des Emplois du Temps
            </h3>
            <div className="personnel-page-subtitle">Suivi hebdomadaire</div>
          </div>
        </div>
        <div className="emplois-actions emplois-actions--header">
          <button
            className="btn admin-accent-btn shadow-sm"
            onClick={openCreate}
          >
            Créer Emploi Du Temps
          </button>
          <button
            type="button"
            className="btn admin-accent-btn shadow-sm admin-conges-history-trigger emplois-requests-btn"
            onClick={openRequestsModal}
          >
            <span>Liste Des Demandes</span>
            {pendingRequestCount ? (
              <span className="emplois-requests-badge">
                {pendingRequestCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/*  Filtres  */}
      <div className="filters-card mb-3">
        <div className="emplois-filters">
          <input
            className="form-control"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="emplois-select" ref={filterTypeDropdownRef}>
            <button
              type="button"
              className={`form-select emplois-select-trigger ${filterTypeDropdownOpen ? "open" : ""}`}
              onClick={() =>
                setFilterTypeDropdownOpen((prev) => {
                  const next = !prev;
                  if (next) {
                    setPersonnelDropdownOpen(false);
                    setServiceDropdownOpen(false);
                    setTypeDropdownOpen(false);
                  }
                  return next;
                })
              }
              aria-expanded={filterTypeDropdownOpen}
            >
              <span>{selectedFilterTypeLabel}</span>
              <span className="emplois-select-caret" aria-hidden="true" />
            </button>
            {filterTypeDropdownOpen ? (
              <div className="emplois-select-menu" role="listbox">
                <button
                  type="button"
                  className={`emplois-select-option ${selectedType ? "" : "active"}`}
                  onClick={() => {
                    setSelectedType("");
                    setFilterTypeDropdownOpen(false);
                  }}
                  role="option"
                  aria-selected={!selectedType}
                >
                  Type (Tous)
                </button>
                {typeOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={`emplois-select-option ${opt === selectedType ? "active" : ""}`}
                    onClick={() => {
                      setSelectedType(opt);
                      setFilterTypeDropdownOpen(false);
                    }}
                    role="option"
                    aria-selected={opt === selectedType}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            className="btn admin-accent-btn filter-btn"
            type="button"
            onClick={applyFilters}
          >
            Filtrer
          </button>
          <button
            className="btn btn-outline-secondary filter-btn reset-btn"
            type="button"
            onClick={resetFilters}
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {/*  Navigation semaine  */}
      <div className="emplois-week-nav">
        <button
          className="btn btn-link"
          onClick={() => setCurrentWeek(addDays(currentWeek, -7))}
        >
          &lt; Semaine Precedente
        </button>
        <div className="emplois-week-center emplois-week-center--split">
          <div className="emplois-legend emplois-legend--week emplois-legend--left">
            <div className="emplois-legend-item">
              <span className="emplois-legend-dot legend-apres-midi" />
              Apres-midi
            </div>
            <div className="emplois-legend-item">
              <span className="emplois-legend-dot legend-matin" />
              Matin
            </div>
            <div className="emplois-legend-item">
              <span className="emplois-legend-dot legend-garde" />
              Garde
            </div>
          </div>
          <div className="emplois-week-range emplois-week-range--inline">
            {weekRangeLabel}
          </div>
          <div className="emplois-week-legend-spacer" aria-hidden="true" />
        </div>
        <div className="emplois-week-next-wrap">
          <button
            className="btn btn-link"
            onClick={() => setCurrentWeek(addDays(currentWeek, 7))}
          >
            Semaine Suivante &gt;
          </button>
        </div>
      </div>

      {/*  Modal création  */}
      {showForm ? (
        <PlanningCreateModal
          open
          onClose={closeForm}
          onSubmit={submitForm}
          error={error}
          form={form}
          handleChange={handleChange}
          minCreateDateIso={minCreateDateIso}
          personnelChoices={personnelChoices}
          isServiceLocked={isServiceLocked}
          serviceOptions={serviceOptions}
          typeOptions={typeOptions}
          isNightRestricted={isNightRestricted}
          hasFixedTime={hasFixedTime}
          isChefServiceSelected={isChefServiceSelected}
          isDayShiftForChefReplacement={isDayShiftForChefReplacement}
          inverseShiftLabel={inverseShiftLabel}
          replacementCandidates={replacementCandidates}
        />
      ) : null}

      {/* / Modals suppression par jour et par semaine / */}
      <PlanningDeleteModal
        open={Boolean(rowDeleteTarget)}
        target={rowDeleteTarget}
        onClose={closeRowDelete}
        busy={rowActionBusy}
        error={error}
        onConfirm={confirmRowDelete}
      />

      {/*  detail de planning  */}
      {previewEntry ? (
        <div className="modal-backdrop-soft" onClick={closePreview}>
          <div
            className="modal-card emplois-card-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={closePreview}>
              ×
            </button>
            <div className="service-edit-header">
              <span className="service-edit-icon" aria-hidden="true" />
              <div className="service-edit-title">
                Détail du Emplois du Temps
              </div>
            </div>
            <div className="modal-body-scroll emplois-modal-body">
              <div className="emplois-preview-meta">
                <div className="fw-semibold">
                  {previewEntry.personnel || previewEntry.matricule || "-"}
                </div>
                <div className="text-muted small">
                  {previewEntry.service || "-"}
                  {previewEntry.grade ? ` | ${previewEntry.grade}` : ""}
                </div>
              </div>
              {!isCongeType(previewEntry.type) ? (
                <div className="emplois-preview-time">
                  {previewEntry.start_time || "--:--"} -{" "}
                  {previewEntry.end_time || "--:--"}
                </div>
              ) : null}
              <div className="emplois-preview-row">
                <span className="text-muted">Date:</span>
                <span>
                  {previewEntry.date || "-"}
                  {previewEntry.date_fin &&
                  previewEntry.date_fin !== previewEntry.date
                    ? ` -> ${previewEntry.date_fin}`
                    : ""}
                </span>
              </div>
              <div className="emplois-preview-row">
                <span className="text-muted">Type:</span>
                <span>{previewEntry.type || "-"}</span>
              </div>
              {previewEntry.notes ? (
                <div className="emplois-preview-notes">
                  <div className="text-muted mb-1">Notes</div>
                  <div>{previewEntry.notes}</div>
                </div>
              ) : null}
              <div className="emplois-preview-actions">
                <button
                  className="btn btn-outline-danger"
                  type="button"
                  onClick={() => {
                    closePreview();
                    openRowDelete(previewEntry);
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/*  Modal demandes  */}
      <PlanningRequestsModal
        open={requestModalOpen}
        onClose={closeRequestsModal}
        requestRows={requestRows}
        rows={rows}
        personnelChoices={personnelChoices}
        congesRows={congesRows}
        requestBusyId={requestBusyId}
        loadRequests={loadRequests}
        updateRequestStatus={updateRequestStatus}
        createReplacementForRequest={createReplacementForRequest}
      />

      {/*  planning  */}
      <div className="table-responsive emplois-grid-wrap">
        <table className="table emplois-grid">
          <thead>
            <tr>
              <th className="emplois-col-personnel">Personnel</th>
              {weekDays.map((day) => (
                <th key={day.iso}>
                  <div className="emplois-day-label">{day.label}</div>
                  <div className="emplois-day-date">{day.date.getDate()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8">Chargement...</td>
              </tr>
            ) : null}
            {!loading && !pageItems.length ? (
              <tr>
                <td colSpan="8">Aucun planning trouve.</td>
              </tr>
            ) : null}
            {pageItems.map((person) => (
              <tr key={person.key}>
                <td className="emplois-personnel">
                  <span className="emplois-personnel-link">{person.name}</span>
                  <div className="emplois-personnel-meta">
                    {person.matricule || "-"}
                  </div>
                  <div className="emplois-row-actions">
                    <button
                      type="button"
                      className="btn btn-sm services-action-delete"
                      onClick={() => openRowDelete(person)}
                    >
                      Supprimer
                    </button>
                  </div>
                </td>
                {weekDays.map((day) => {
                  const entries = getEntries(person.key, day.iso);//yraje3 les shifts mta3 lpersonnel finafes nhar mratbin  
                  const personMatricule = ( person?.matricule || person?.key || "").toString().trim();
                  const requestPayload = personMatricule
                    ? requestByMatriculeDate.get(`${personMatricule}|${day.iso}`,) || null
                    : null;//tjib demande de personnel 
                  const requestRow = requestPayload?.row || null;
                  const requestTone = requestPayload?.tone || "";
                  return (
                    <td key={day.iso} className="emplois-cell">
                      {requestRow ? (
                        <div
                          className={`emplois-request-chip tone-${requestTone}`}
                          role="button"
                          tabIndex={0}//5ater div moch botton donc on utilise tabindex bach admin injam yiclikiii sur demande
                          onClick={(e) => {
                            e.stopPropagation();
                            pendingNavFocusRef.current = requestRow.id ?? null;
                            setRequestModalOpen(true);
                          }}
                          //support keyboard interaction.
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            pendingNavFocusRef.current = requestRow.id ?? null;
                            setRequestModalOpen(true);
                          }}
                          title={ "Demande de modification"}//lilhover 3liha
                        >
                          {(() => {
                            const type = mapRequestShiftToType(
                              requestRow?.shift_type || "",
                            );
                            const preset = TYPE_PRESETS[type];
                            const label = preset
                              ? `${preset.start}-${preset.end}`
                              : "";
                            return `Modif: ${label ? `${label} ` : ""}${type || "Shift"}`.trim();
                          })()}
                        </div>
                      ) : null}
                      {entries.map((entry) => (
                        <div
                          key={entry.id}
                          className={`emplois-card emplois-type-${getTypeClass(entry.type)}`}
                          onClick={() => openPreview(entry)}
                        >
                          {!isCongeType(entry.type) ? (
                            <div className="emplois-card-time">
                              {entry.start_time} - {entry.end_time}
                            </div>
                          ) : null}
                          <div className="emplois-card-meta">
                            {entry.service || "Service"}
                          </div>
                          {entry.grade ? (
                            <div className="emplois-card-type">
                              {entry.grade}
                            </div>
                          ) : (
                            <div className="emplois-card-type">
                              {entry.type}
                            </div>
                          )}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*  Pagination */}
      <div className="emplois-footer">
        <div>
          Afficher {pageItems.length === 0 ? 0 : pageStart + 1} a{" "}
          {pageStart + pageItems.length} sur {filteredPersonnel.length} entrees
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-light"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Precedent
          </button>
          <span className="services-page-num">{currentPage}</span>
          <button
            type="button"
            className="btn btn-sm btn-light"
            onClick={() =>
              setCurrentPage((prev) => Math.min(totalPages, prev + 1))
            }
            disabled={currentPage === totalPages}
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}