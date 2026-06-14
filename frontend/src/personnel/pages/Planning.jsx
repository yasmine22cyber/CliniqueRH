import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../../admin/admin.css";
import "../personnel.css";
import PlanningRequestModal from "../components/PlanningRequestModal";
import PlanningRequestHistoryModal from "../components/PlanningRequestHistoryModal";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const formatMonthTitleFr = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});
const formatDayLabelFr = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const MONTH_WEEK_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const WEEK_CYCLE_SIZE = 4;

const TYPE_TONE = {
  matin: "matin",
  "apres-midi": "apres-midi",
  garde: "garde",
};

const SHIFT_PRESETS = {
  Matin: { start: "07:00", end: "14:00" },
  "Apres-midi": { start: "14:00", end: "19:00" },
  Garde: { start: "19:00", end: "07:00" },
};

const REQUEST_SHIFT_OPTIONS = ["Matin", "Apres-midi", "Garde"];

const normalizeTypeKey = (value) => {
  const raw = (value || "").toString().trim().toLowerCase();
  if (!raw) return "";
  return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

const typeLabel = (type) => (type || "Type").toString();

const normalizeDateValue = (value) => {
  if (!value) return "";
  const str = String(value);
  return str.length >= 10 ? str.slice(0, 10) : str;
};

const normalizeRequestStatusKey = (value = "") => {
  const normalized = value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (normalized.startsWith("approuv")) return "approved";
  if (normalized.startsWith("refus")) return "refused";
  if (normalized.startsWith("annul")) return "canceled";
  return "pending";
};

const parseDateValue = (value) => {
  const iso = normalizeDateValue(value);
  const [y, m, d] = iso.split("-").map((part) => Number(part));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const toIsoToday = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const toIso = (dateObj) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const addDays = (dateObj, days) => {
  const next = new Date(dateObj);
  next.setDate(next.getDate() + days);
  return next;
};

const minRequestDateIso = () => toIso(addDays(new Date(), 2));
//tamal creation de 42 jour lill calendrier 
const getMonthDays = (anchor) => {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push({
      date: d,
      iso: toIso(d),
      inMonth: d.getMonth() === month,
      label: d.getDate(),
    });
  }
  return days;
};

const getTypeTone = (value) => TYPE_TONE[normalizeTypeKey(value)] || "default";
const shortTime = (value) => (value || "--:--").toString().slice(0, 5);

const normalizeShiftLabel = (value = "") => {
  const raw = (value || "").toString().trim();
  if (!raw) return "";
  const key = normalizeTypeKey(raw);
  if (key.includes("apres")) return "Apres-midi";
  if (key.includes("garde")) return "Garde";
  if (key.includes("matin")) return "Matin";
  return raw;
};

const requestChipLabel = (row) => {
  const shift = normalizeShiftLabel(row?.shift_type);
  const preset = SHIFT_PRESETS[shift];
  if (!shift) return "Modif: --";
  if (!preset) return `Modif: ${shift}`;
  return `Modif: ${preset.start}-${preset.end} ${shift}`;
};

const mapPlanningShiftToRequestLabel = (value = "") => {
  const key = normalizeTypeKey(value);
  if (!key) return "";
  if (key.includes("apres")) return "Apres-midi";
  if (key.includes("garde")) return "Garde";
  if (key.includes("matin")) return "Matin";
  return "";
};

const weekCycleLabelFromIndex = (idx) => {
  const cycle = (Math.floor(idx / 7) % WEEK_CYCLE_SIZE) + 1;
  return `S${cycle}`;
};

export default function PlanningPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestSuccess, setRequestSuccess] = useState("");
  
  const [requestHistorySuccess, setRequestHistorySuccess] = useState("");
  const [requestHistorySuccessTone, setRequestHistorySuccessTone] = useState("");
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestHistory, setRequestHistory] = useState([]);
  const [requestHistoryLoading, setRequestHistoryLoading] = useState(false);
  const [requestHistoryError, setRequestHistoryError] = useState("");
  const [requestHistoryOpen, setRequestHistoryOpen] = useState(false);
  const [requestEditId, setRequestEditId] = useState(null);
  const [requestHistoryBusyId, setRequestHistoryBusyId] = useState(null);
  const [requestFieldErrors, setRequestFieldErrors] = useState({
    date_preferee: "",
    shift_type: "",
    raison: "",
  });
  const pendingHistoryReopenRef = useRef(false);
  const [requestForm, setRequestForm] = useState({
    date_preferee: toIsoToday(),
    shift_type: REQUEST_SHIFT_OPTIONS[0],
    raison: "",
  });
  const [userMatricule, setUserMatricule] = useState("");
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [selectedDateIso, setSelectedDateIso] = useState(() => toIsoToday());
  const initSelectionRef = useRef(false);
  const pendingNavFocusRef = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("authUser");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const matricule = (parsed?.matricule || "").toString().trim();
      setUserMatricule(matricule);
    } catch {
      setUserMatricule("");
    }
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("nav_intent_v1");
      if (!raw) return;
      const intent = JSON.parse(raw);
      if (intent?.tab !== "planning") return;
      if (intent?.action !== "openPlanningHistory") return;

      pendingNavFocusRef.current = intent?.focusId ?? null;
      sessionStorage.removeItem("nav_intent_v1");

      setRequestHistoryOpen(true);
    } catch {
       //
    }
  }, []);

  useEffect(() => {
    if (!requestHistoryOpen) return;
    const focusId = pendingNavFocusRef.current;
    if (!focusId) return;

    const attempt = () => {
      const el = document.getElementById(
        `personnel-planning-request-${focusId}`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        pendingNavFocusRef.current = null;
      }
    };

    const timer = setTimeout(attempt, 0);
    return () => clearTimeout(timer);
  }, [requestHistoryOpen]);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      if (!/^\d{10}$/.test(userMatricule)) {
        setRows([]);
        setError("Matricule introuvable dans votre session."); setTimeout(() => setError(""), 4000);
        return;
      }
      const token = localStorage.getItem("authToken");
      const resp = await fetch(
        `${API_BASE_URL}/api/planning?matricule=${encodeURIComponent(userMatricule)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      const data = await resp.json().catch(() => []);
      if (!resp.ok) {
        throw new Error(data?.message || "Chargement impossible.");
      }
      const list = Array.isArray(data) ? data : [];
      const normalized = list
        .filter((row) => String(row?.matricule || "") === userMatricule)
        .map((row) => ({
          ...row,
          date: normalizeDateValue(row?.date),
          date_fin: normalizeDateValue(row?.date_fin || row?.date),
        }));

      setRows(normalized);
      if (normalized.length && !initSelectionRef.current) {
        const todayIso = toIsoToday();
        const sorted = [...normalized].sort((a, b) =>
          String(a.date).localeCompare(String(b.date)),
        );
        const next = sorted.find((row) => String(row.date || "") >= todayIso);
        const nextDate = parseDateValue(next?.date || todayIso);
        if (nextDate) {
          setMonthAnchor(
            new Date(nextDate.getFullYear(), nextDate.getMonth(), 1),
          );
          setSelectedDateIso(toIso(nextDate));
        }
        initSelectionRef.current = true;
      }
    } catch (err) {
      setError(err.message || "Erreur serveur."); setTimeout(() => setError(""), 4000);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userMatricule) return;
    initSelectionRef.current = false;
    load();
  }, [userMatricule]);

  const loadRequestHistory = async () => {
    try {
      if (!/^\d{10}$/.test(userMatricule)) {
        setRequestHistory([]);
        return;
      }
      setRequestHistoryLoading(true);
      setRequestHistoryError("");
      const token = localStorage.getItem("authToken");
      const resp = await fetch(
        `${API_BASE_URL}/api/planning-requests?matricule=${encodeURIComponent(userMatricule)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      const data = await resp.json().catch(() => []);
      if (!resp.ok) {
        throw new Error(data?.message || "Chargement historique impossible.");
      }
      setRequestHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      setRequestHistory([]);
      setRequestHistoryError(err.message || "Erreur serveur."); setTimeout(() => setRequestHistoryError(""), 4000);
    } finally {
      setRequestHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!userMatricule) return;
    loadRequestHistory();
  }, [userMatricule]);

  useEffect(() => {
    if (!requestSuccess) return undefined;
    const timer = setTimeout(() => setRequestSuccess(""), 4000);
    return () => clearTimeout(timer);
  }, [requestSuccess]);

  useEffect(() => {
    if (!requestError) return undefined;
    const timer = setTimeout(() => setRequestError(""), 4000);
    return () => clearTimeout(timer);
  }, [requestError]);

  useEffect(() => {
    if (!requestHistorySuccess) return undefined;
    const timer = setTimeout(() => {
      setRequestHistorySuccess("");
      setRequestHistorySuccessTone("");
    }, 4000);
    return () => clearTimeout(timer);
  }, [requestHistorySuccess]);

  const sortedRows = useMemo(() => {
    return [...rows].sort(
      (a, b) =>
        String(a.date).localeCompare(String(b.date)) ||
        String(a.start_time || "").localeCompare(String(b.start_time || "")),
    );
  }, [rows]);

  const rowsByDate = useMemo(() => {
    const map = new Map();
    sortedRows.forEach((row) => {
      const iso = String(row.date || "");
      if (!map.has(iso)) map.set(iso, []);
      map.get(iso).push(row);
    });
    map.forEach((list) => {
      list.sort((a, b) =>
        String(a.start_time || "").localeCompare(String(b.start_time || "")),
      );
    });
    return map;
  }, [sortedRows]);

  const monthDays = useMemo(() => getMonthDays(monthAnchor), [monthAnchor]);
  const todayIso = toIsoToday();
  const selectedEntries = useMemo(
    () => rowsByDate.get(selectedDateIso) || [],
    [rowsByDate, selectedDateIso],
  );
  const selectedDateObj = useMemo(
    () => parseDateValue(selectedDateIso),
    [selectedDateIso],
  );
  const selectedDateLabel = selectedDateObj
    ? formatDayLabelFr.format(selectedDateObj)
    : selectedDateIso;

  const requestsByDate = useMemo(() => {
    const map = new Map();
    requestHistory.forEach((row) => {
      const iso = normalizeDateValue(row?.date_preferee);
      if (!iso) return;

      const statusKey = normalizeRequestStatusKey(
        row?.statut || row?.status || "",
      );
      if (statusKey !== "pending" && statusKey !== "approved") return;

      const stamp =
        new Date(
          row?.updated_at || row?.created_at || row?.date_preferee || 0,
        ).getTime() || 0;
      const existing = map.get(iso);
      if (!existing) {
        map.set(iso, { row, statusKey, stamp });
        return;
      }

      const existingPriority = existing.statusKey === "approved" ? 2 : 1;
      const nextPriority = statusKey === "approved" ? 2 : 1;
      if (nextPriority > existingPriority || stamp > existing.stamp) {
        map.set(iso, { row, statusKey, stamp });
      }
    });
    return map;
  }, [requestHistory]);

  const selectedRequestPayload = useMemo(
    () => requestsByDate.get(selectedDateIso) || null,
    [requestsByDate, selectedDateIso],
  );
  const selectedRequest = selectedRequestPayload?.row || null;
  const selectedRequestTone = selectedRequestPayload?.statusKey || "";

  const selectDay = (day) => {
    setSelectedDateIso(day.iso);
    if (!day.inMonth) {
      setMonthAnchor(new Date(day.date.getFullYear(), day.date.getMonth(), 1));
    }
  };

  const shiftOptionsForDate = useCallback(
    (dateIso) => {
      const iso = normalizeDateValue(dateIso);
      if (!iso) return REQUEST_SHIFT_OPTIONS;
      const entries = rowsByDate.get(iso) || [];
      const existingShift = entries
        .map((row) => mapPlanningShiftToRequestLabel(row?.type || ""))
        .find((label) => Boolean(label));
      if (!existingShift) return REQUEST_SHIFT_OPTIONS;
      return REQUEST_SHIFT_OPTIONS.filter((opt) => opt !== existingShift);
    },
    [rowsByDate],
  );

  const requestShiftOptions = useMemo(
    () => shiftOptionsForDate(requestForm.date_preferee),
    [requestForm.date_preferee, shiftOptionsForDate],
  );

  const openRequestModal = () => {
    if (!rows.length) {
      setError("Aucun planning disponible. Demande de modification impossible."); setTimeout(() => setError(""), 4000);
      return;
    }
    setRequestError("");
    setRequestSuccess("");
    setRequestEditId(null);
    setRequestFieldErrors({ date_preferee: "", shift_type: "", raison: "" });
    const minDateIso = minRequestDateIso();
    const desiredDate = selectedDateIso || minDateIso;
    const options = shiftOptionsForDate(desiredDate);
    setRequestForm({
      date_preferee: desiredDate,
      shift_type: options[0] || REQUEST_SHIFT_OPTIONS[0],
      raison: "",
    });
    if (desiredDate && desiredDate < minDateIso) {
      setRequestFieldErrors((prev) => ({
        ...prev,
        date_preferee: "La date doit etre au moins 2 jours a l'avance.",
      }));
    }
    setRequestModalOpen(true);
  };

  const openEditRequest = (row) => {
    if (!row) return;
    setRequestError("");
    setRequestSuccess("");
    setRequestHistoryError("");
    setRequestHistorySuccess("");
    setRequestHistorySuccessTone("");
    setRequestEditId(row.id);
    setRequestFieldErrors({ date_preferee: "", shift_type: "", raison: "" });
    const minDateIso = minRequestDateIso();
    const rowDate = normalizeDateValue(row.date_preferee);
    const desiredDate = rowDate || minDateIso;
    const options = shiftOptionsForDate(desiredDate);
    const desiredShift = normalizeShiftLabel(row.shift_type);
    setRequestForm({
      date_preferee: desiredDate,
      shift_type: options.includes(desiredShift)
        ? desiredShift
        : options[0] || REQUEST_SHIFT_OPTIONS[0],
      raison: row.raison || "",
    });
    if (desiredDate && desiredDate < minDateIso) {
      setRequestFieldErrors((prev) => ({
        ...prev,
        date_preferee: "La date doit etre au moins 2 jours a l'avance.",
      }));
    }
    setRequestModalOpen(true);
  };

  const closeRequestModal = () => {
    if (requestSaving) return;
    setRequestModalOpen(false);
    setRequestEditId(null);
    pendingHistoryReopenRef.current = false;
  };

  const closeRequestHistoryModal = () => {
    setRequestHistoryOpen(false);
    setRequestHistorySuccess("");
    setRequestHistorySuccessTone("");
  };

  const submitRequest = async (event) => {
    event.preventDefault();
    setRequestError("");
    setRequestFieldErrors({ date_preferee: "", shift_type: "", raison: "" });
    if (!/^\d{10}$/.test(userMatricule)) {
      setRequestError("Matricule introuvable dans votre session."); setTimeout(() => setRequestError(""), 4000);
      return;
    }
    const isEdit = Number.isFinite(requestEditId) && requestEditId !== null;
    const minDateIso = minRequestDateIso();
    const requestedDate = normalizeDateValue(requestForm.date_preferee);
    const nextErrors = { date_preferee: "", shift_type: "", raison: "" };
    let hasError = false;
    if (!requestedDate) {
      nextErrors.date_preferee = "Veuillez remplir ce champ.";
      hasError = true;
    } else if (requestedDate < minDateIso) {
      nextErrors.date_preferee =
        "La date doit etre au moins 2 jours a l'avance.";
      hasError = true;
    }
    if (!requestForm.shift_type) {
      nextErrors.shift_type = "Veuillez remplir ce champ.";
      hasError = true;
    }
    if (!requestForm.raison.trim()) {
      nextErrors.raison = "Veuillez saisir une raison.";
      hasError = true;
    }
    if (hasError) {
      setRequestFieldErrors(nextErrors);
      return;
    }
    //fama demande mawjouda fard date
    const hasExistingSameDate = requestHistory.some((row) => {
      const rowDate = normalizeDateValue(row?.date_preferee);
      if (rowDate !== requestedDate) return false;
      if (isEdit && Number(row?.id) === Number(requestEditId)) return false;
      const statusKey = normalizeRequestStatusKey(row?.statut || row?.status || "");
      if (statusKey !== "pending" && statusKey !== "approved") return false;
      return true;
    });
    if (hasExistingSameDate) {
      setRequestFieldErrors((prev) => ({
        ...prev,
        date_preferee:
          "Vous avez deja une demande pour cette date. Modifiez-la depuis l'historique.",
      }));
      return;
    }

    const entriesForRequestedDate = rowsByDate.get(requestedDate) || [];
    if (!entriesForRequestedDate.length) {
      setRequestFieldErrors((prev) => ({
        ...prev,
        date_preferee: "Vous n'avez aucun emploi du temps pour cette date.",
      }));
      return;
    }
    const existingShiftLabel = entriesForRequestedDate
      .map((row) => mapPlanningShiftToRequestLabel(row?.type || ""))
      .find((label) => Boolean(label));
    if (existingShiftLabel && existingShiftLabel === requestForm.shift_type) {
      setRequestFieldErrors((prev) => ({
        ...prev,
        shift_type: "Vous etes deja planifie sur ce shift pour cette date.",
      }));
      return;
    }
    try {
      setRequestSaving(true);
      const token = localStorage.getItem("authToken");
      const resp = await fetch(
        isEdit
          ? `${API_BASE_URL}/api/planning-requests/${requestEditId}`
          : `${API_BASE_URL}/api/planning-requests`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            matricule: userMatricule,
            date_preferee: requestForm.date_preferee,
            shift_type: requestForm.shift_type,
            raison: requestForm.raison.trim(),
          }),
        },
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.message || "Envoi impossible.");
      }
      const dateLabel = normalizeDateValue(requestForm.date_preferee) || "--";
      const shiftLabel = normalizeShiftLabel(requestForm.shift_type) || "--";
      const successMessage = isEdit
        ? `Demande modifiee: ${dateLabel} \u2022 Shift ${shiftLabel}.`
        : `Demande envoyee: ${dateLabel} \u2022 Shift ${shiftLabel}.`;
      await loadRequestHistory();
      if (isEdit) {
        setRequestSuccess("");
        setRequestHistoryError("");
        setRequestHistorySuccess(successMessage); setTimeout(() => setRequestHistorySuccess(""), 4000);
        setRequestHistorySuccessTone("pending");
        setRequestHistoryOpen(true);
      } else {
        setRequestSuccess(successMessage); setTimeout(() => setRequestSuccess(""), 4000);
      }
      // ysaker lformulaire immediatement ba3ed succes
      pendingHistoryReopenRef.current = false;
      setRequestModalOpen(false);
      setRequestEditId(null);
    } catch (err) {
      const message = err.message || "Erreur serveur.";
      const lower = message.toString().toLowerCase();
      if (lower.includes("shift") || lower.includes("planifie")) {
        setRequestFieldErrors((prev) => ({ ...prev, shift_type: message }));
      } else if (lower.includes("date")) {
        setRequestFieldErrors((prev) => ({ ...prev, date_preferee: message }));
      } else if (lower.includes("raison")) {
        setRequestFieldErrors((prev) => ({ ...prev, raison: message }));
      } else {
        setRequestError(message); setTimeout(() => setRequestError(""), 4000);
      }
    } finally {
      setRequestSaving(false);
    }
  };

  const cancelRequest = async (row) => {
    if (!row?.id || !userMatricule) return;
    try {
      setRequestHistoryError("");
      setRequestHistorySuccess("");
      setRequestHistorySuccessTone("");
      setRequestHistoryBusyId(row.id);
      const token = localStorage.getItem("authToken");
      const resp = await fetch(
        `${API_BASE_URL}/api/planning-requests/${row.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            matricule: userMatricule,
            statut: "Annuler",
          }),
        },
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.message || "Annulation impossible.");
      }
      await loadRequestHistory();
      const dateLabel = normalizeDateValue(row.date_preferee) || "--";
      const shiftLabel = normalizeShiftLabel(row.shift_type) || "--";
      setRequestHistorySuccess(`Demande annulee: ${dateLabel} \u2022 Shift ${shiftLabel}.`); setTimeout(() => setRequestHistorySuccess(""), 4000);
      setRequestHistorySuccessTone("canceled");
    } catch (err) {
      setRequestHistoryError(err.message || "Erreur serveur."); setTimeout(() => setRequestHistoryError(""), 4000);
    } finally {
      setRequestHistoryBusyId(null);
    }
  };

  return (
    <div className="admin-card leave-card-shell planning-page">
      <div className="d-flex justify-content-between align-items-start mb-0">
        <div className="personnel-page-title-wrap">
          <span className="personnel-page-title-line" aria-hidden="true" />
          <div>
            <h3 className="personnel-page-title mb-1">Mon Emplois du Temps</h3>
            <div className="personnel-page-subtitle leave-subtitle">
              Consultez vos creneaux mensuels
            </div>
          </div>
        </div>
        <div className="d-flex gap-2 flex-column align-items-end">
          <button
            className="btn admin-accent-btn"
            onClick={openRequestModal}
            disabled={loading || !rows.length}
            title={
              rows.length
                ? ""
                : "Aucun planning disponible. Demande de modification impossible."
            }
          >
            Demander Modification
          </button>
          <button
            type="button"
            className="btn admin-accent-btn shadow-sm admin-conges-history-trigger"
            onClick={() => {
              if (requestHistoryOpen) {
                closeRequestHistoryModal();
              } else {
                setRequestHistoryOpen(true);
              }
            }}
          >
            <span
              className="admin-conges-history-trigger-icon"
              aria-hidden="true"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="8.5"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M12 7.5v5l3 1.8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            Historique des demandes
          </button>
        </div>
      </div>

      {error ? (
        <div className="alert alert-danger py-2 mb-3">{error}</div>
      ) : null}
      {requestSuccess ? (
        <div className="alert alert-success py-2 mb-3">{requestSuccess}</div>
      ) : null}
      {loading && !rows.length ? (
        <div className="mt-3">Chargement...</div>
      ) : null}
      {!loading ? (
        <>
          {!rows.length ? (
            <div className="planning-empty planning-empty--compact">
              Aucun planning disponible pour le moment. Le calendrier reste
              visible.
            </div>
          ) : null}
          <div className="leave-calendar card shadow-sm planning-month-shell">
            <div className="planning-day-summary">
              <div className="planning-day-summary-main">
                <div className="planning-day-summary-title">
                  Shift du {selectedDateLabel}
                </div>
                <div className="planning-day-summary-count">
                  {selectedEntries.length
                    ? `${selectedEntries.length} shift(s)`
                    : "Aucun shift"}
                </div>
              </div>
              {selectedEntries.length || selectedRequest ? (
                <div className="planning-day-summary-list">
                  {selectedRequest ? (
                    <div
                      className={`planning-day-request-chip tone-${selectedRequestTone}`}
                      title={
                        (selectedRequest?.raison || "").toString().trim() ||
                        "Demande de modification"
                      }
                    >
                      {requestChipLabel(selectedRequest)}
                    </div>
                  ) : null}
                  {selectedEntries.slice(0, 2).map((entry) => (
                    <div
                      key={`summary-${entry.id}`}
                      className={`planning-day-summary-item tone-${getTypeTone(entry.type)}${entry.notes ? " has-notes" : ""
                        }`}
                      title={`${shortTime(entry.start_time)}-${shortTime(entry.end_time)} ${typeLabel(entry.type)}${entry.service ? ` • ${entry.service}` : ""
                        }${entry.notes ? ` • ${entry.notes}` : ""}`}
                    >
                      <span className="planning-day-summary-time">
                        {shortTime(entry.start_time)}-
                        {shortTime(entry.end_time)}
                      </span>
                      <span className="planning-day-summary-type">
                        {typeLabel(entry.type)}
                      </span>
                      {entry.service ? (
                        <span className="planning-day-summary-service">
                          {entry.service}
                        </span>
                      ) : null}
                      {entry.notes ? (
                        <span className="planning-day-summary-notes">
                          {entry.notes}
                        </span>
                      ) : null}
                    </div>
                  ))}
                  {selectedEntries.length > 2 ? (
                    <span className="planning-day-summary-more">
                      +{selectedEntries.length - 2} autres
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="planning-day-summary-empty">
                  Aucun shift prevu ce jour.
                </div>
              )}
            </div>
            <div className="planning-month-header">
              <button
                type="button"
                className="cal-nav-btn"
                onClick={() =>
                  setMonthAnchor(
                    (prev) =>
                      new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                  )
                }
                aria-label="Mois precedent"
              >
                &lt;
              </button>
              <div className="planning-month-title text-capitalize">
                {formatMonthTitleFr.format(monthAnchor)}
              </div>
              <button
                type="button"
                className="cal-nav-btn"
                onClick={() =>
                  setMonthAnchor(
                    (prev) =>
                      new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                  )
                }
                aria-label="Mois suivant"
              >
                &gt;
              </button>
            </div>

            <div className="planning-month-grid">
              <div className="planning-month-week-spacer" aria-hidden="true" />
              {MONTH_WEEK_LABELS.map((label) => (
                <div key={label} className="planning-month-weekday">
                  {label}
                </div>
              ))}

              {monthDays.map((day, idx) => {
                const entries = rowsByDate.get(day.iso) || [];
                const requestPayload = requestsByDate.get(day.iso) || null;
                const requestRow = requestPayload?.row || null;
                const requestTone = requestPayload?.statusKey || "";
                const count = entries.length;
                const isSelected = day.iso === selectedDateIso;
                const isToday = day.iso === todayIso;
                const visibleEntries = entries.slice(0, 1);
                return (
                  <Fragment key={day.iso}>
                    {idx % 7 === 0 ? (
                      <div
                        className="planning-week-index"
                        aria-label={`Semaine ${weekCycleLabelFromIndex(idx)}`}
                      >
                        {weekCycleLabelFromIndex(idx)}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className={`planning-month-day${day.inMonth ? "" : " muted"}${isSelected ? " selected" : ""
                        }${isToday ? " today" : ""}${!isToday ? " not-today" : ""}`}
                      onClick={() => selectDay(day)}
                    >
                      <div className="planning-month-day-head">
                        <span className="planning-month-bubble">
                          {day.label}
                        </span>
                        <div className="planning-month-day-head-right">
                          {count > 0 ? (
                            <span className="planning-month-count">
                              {count}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="planning-month-shifts">
                        {!visibleEntries.length ? (
                          <span className="planning-month-no-shift">
                            Aucun creneau
                          </span>
                        ) : (
                          visibleEntries.map((row) => (
                            <div
                              key={row.id}
                              className={`planning-month-shift-chip tone-${getTypeTone(row.type)}`}
                              title={`${shortTime(row.start_time)}-${shortTime(row.end_time)} ${typeLabel(row.type)}${row.service ? ` \u2022 ${row.service}` : ""
                                }${row.notes ? ` \u2022 ${row.notes}` : ""}`}
                            >
                              <span className="planning-month-shift-main">
                                {shortTime(row.start_time)}-{shortTime(row.end_time)}{" "}
                                {typeLabel(row.type)}
                              </span>
                              {row.notes ? (
                                <span className="planning-month-shift-note">
                                  {row.notes}
                                </span>
                              ) : null}
                            </div>
                          ))
                        )}
                        {requestRow ? (
                          <span
                            className={`planning-month-request-chip tone-${requestTone}`}
                            title={
                              (requestRow?.raison || "").toString().trim() ||
                              "Demande de modification"
                            }
                          >
                            {requestChipLabel(requestRow)}
                          </span>
                        ) : null}
                        {entries.length > visibleEntries.length ? (
                          <span className="planning-month-more">
                            +{entries.length - visibleEntries.length} autres
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      <PlanningRequestHistoryModal
        open={requestHistoryOpen}
        onClose={closeRequestHistoryModal}
        list={requestHistory}
        historySuccess={requestHistorySuccess}
        historySuccessTone={requestHistorySuccessTone}
        historyError={requestHistoryError}
        historyLoading={requestHistoryLoading}
        historyBusyId={requestHistoryBusyId}
        onEditRequest={(row) => {
          openEditRequest(row);
        }}
        onCancelRequest={cancelRequest}
      />

      <PlanningRequestModal
        open={requestModalOpen}
        onClose={closeRequestModal}
        requestEditId={requestEditId}
        requestFieldErrors={requestFieldErrors}
        requestError={requestError}
        submitRequest={submitRequest}
        requestForm={requestForm}
        setRequestForm={setRequestForm}//lilupdate demande
        minRequestDateIso={minRequestDateIso}
        shiftOptionsForDate={shiftOptionsForDate}
        requestShiftOptions={requestShiftOptions}
        setRequestFieldErrors={setRequestFieldErrors}
        setRequestError={setRequestError}
        requestSaving={requestSaving}
      />
    </div>
  );
}
