import { useEffect, useMemo, useRef, useState } from "react";
import "../personnel.css";
import CongesHistoryModal from "../components/CongesHistoryModal";
import CongesEditModal from "../components/CongesEditModal";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : "http://localhost:5000");

const MAX_LEAVE_DAYS = 30;
const MIN_LEAD_DAYS = 2;
const isApprovedStatus = (s = "") => s.toString().toLowerCase().startsWith("approuv");

const normalizeStatus = (value = "") =>
  value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeText = (value = "") => normalizeStatus(value);

const diffInDays = (start, end) => {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  const ms = e.getTime() - s.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1; 
};

const annualDaysWithinYear = (startIso, endIso, year) => {
  if (!startIso || !endIso || !Number.isFinite(year)) return 0;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const clampedStart = startIso < yearStart ? yearStart : startIso;
  const clampedEnd = endIso > yearEnd ? yearEnd : endIso;
  if (clampedEnd < clampedStart) return 0;
  return diffInDays(clampedStart, clampedEnd);
};

const isAnnualLeaveType = (type = "") => {
  const normalized = normalizeText(type);
  return normalized.includes("conge annuel") || normalized === "annuel";
};

const todayISO = () => {
  const now = new Date();
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return localMidnight.toLocaleDateString("en-CA");
};
//tihsibb fihh akall date masmoh abch tabada bih conge
const minLeadISO = () => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + MIN_LEAD_DAYS);
  return d.toLocaleDateString("en-CA");
};

const asLocalISO = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toISO = (value) => {
  if (!value) return "";

  if (typeof value === "string") {
    const raw = value.trim();
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return asLocalISO(d);
};

const _displayDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("fr-FR");
  const s = String(value);
  return s.includes("T") ? s.split("T")[0] : s.slice(0, 10);
};

const _formatSubmittedLabel = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
};

const getRowTypeLabel = (row) =>
  String(row?.type_conge_label || "").trim() || "";

const statusLabel = (value) => {
  const normalized = normalizeStatus(value);
  if (normalized.startsWith("approuv")) return "Approuvé";
  if (normalized.startsWith("refus")) return "Refusé";
  if (normalized.startsWith("annul")) return "Annulé";
  return "En attente";
};

const monthLabel = (date) => date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
//tamal creation mta3 calendrier de 42 jours ala 6 weeks 
const getMonthDays = (anchor) => {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;//ikhalii tabda ahad=0 etthninn=1(6 traj3ni lnhar lethnin % na3rfo biha eneho awel nhar fi shhar)
  const start = new Date(year, month, 1 - offset);
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push({
      date: d,
      inMonth: d.getMonth() === month,
      iso: toISO(d),
      label: d.getDate(),
    });
  }
  return days;
};

const buildInitialForm = (defaultTypeId = "") => ({
  type_conge_id: defaultTypeId,
  raison: "",
  du: minLeadISO(),
  au: minLeadISO(),
});

export default function CongesPage() {
  const [types, setTypes] = useState([]);
  const [typesLoading, setTypesLoading] = useState(false);
  const [typesError, setTypesError] = useState("");

  const [form, setForm] = useState(() => buildInitialForm());
  const [editForm, setEditForm] = useState(() => buildInitialForm());
  const [editId, setEditId] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [list, setList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [historySuccess, setHistorySuccess] = useState("");
  const [historySuccessTone, setHistorySuccessTone] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const [editError, setEditError] = useState("");
  const [editFormErrors, setEditFormErrors] = useState({});
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef(null);
  const pendingNavFocusRef = useRef(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("nav_intent_v1");
      if (!raw) return;
      const intent = JSON.parse(raw);
      if (intent?.tab !== "conges") return;
      if (intent?.action !== "openCongesHistory") return;

      pendingNavFocusRef.current = intent?.focusId ?? null;
      sessionStorage.removeItem("nav_intent_v1");

      setHistoryOpen(true);
    } catch {
      // 
    }
  }, []);

  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(""), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (!historySuccess) return undefined;
    const timer = setTimeout(() => {
      setHistorySuccess("");
      setHistorySuccessTone("");
    }, 5000);
    return () => clearTimeout(timer);
  }, [historySuccess]);

  useEffect(() => {
    if (!historyOpen) return;
    const focusId = pendingNavFocusRef.current;
    if (!focusId) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`personnel-conge-history-${focusId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        pendingNavFocusRef.current = null;
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [historyOpen]);

  const matricule = useMemo(() => {
    try {
      const raw = localStorage.getItem("authUser");
      return raw ? JSON.parse(raw)?.matricule || "" : "";
    } catch {
      return "";
    }
  }, []);

  const requesterLabel = useMemo(() => {
    try {
      const raw = localStorage.getItem("authUser");
      const user = raw ? JSON.parse(raw) : null;
      const fullName = `${user?.prenom || ""} ${user?.nom || ""}`.trim();
      return fullName || String(user?.matricule || "").trim() || String(matricule || "").trim() || "Vous";
    } catch {
      return String(matricule || "").trim() || "Vous";
    }
  }, [matricule]);

  const defaultTypeId = useMemo(() => (types.length ? String(types[0]?.id ?? "") : ""), [types]);

  const loadTypes = async () => {
    setTypesLoading(true);
    setTypesError("");
    try {
      const resp = await fetch(`${API_BASE_URL}/api/types-conge`);
      const data = await resp.json().catch(() => []);
      if (!resp.ok) throw new Error(data?.message || "Impossible de charger les types.");
      const safe = Array.isArray(data) ? data : [];
      setTypes(safe.filter((t) => t && (t.id !== null && typeof t.id !== "undefined")));
    } catch (e) {
      setTypes([]);
      setTypesError(e.message || "Erreur serveur."); setTimeout(() => setTypesError(""), 4000);
    } finally {
      setTypesLoading(false);
    }
  };

  useEffect(() => {
    loadTypes();
  }, []);

  useEffect(() => {
    if (!defaultTypeId) return;
    setForm((prev) =>
      String(prev.type_conge_id || "").trim() ? prev : { ...prev, type_conge_id: defaultTypeId }
    );
    setEditForm((prev) =>
      String(prev.type_conge_id || "").trim() ? prev : { ...prev, type_conge_id: defaultTypeId }
    );
  }, [defaultTypeId]);

  const selectedDays = useMemo(
    () => (form.du && form.au ? diffInDays(form.du, form.au) : 0),
    [form.du, form.au]
  );

  const annualUsedByYear = useMemo(() => {
    const map = new Map();

    for (const row of list) {
      if (!isApprovedStatus(row?.statut)) continue;
      if (!isAnnualLeaveType(getRowTypeLabel(row))) continue;

      const startIso = toISO(row?.date_debut);
      const endIso = toISO(row?.date_fin);
      if (!startIso || !endIso) continue;

      const startYear = Number.parseInt(startIso.slice(0, 4), 10);
      const endYear = Number.parseInt(endIso.slice(0, 4), 10);
      if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) continue;

      for (let year = startYear; year <= endYear; year++) {
        const days = annualDaysWithinYear(startIso, endIso, year);
        if (!days) continue;
        map.set(year, (map.get(year) || 0) + days);
      }
    }

    return map;
  }, [list]);

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const annualApprovedDaysUsed = annualUsedByYear.get(currentYear) || 0;
  const annualRemainingDays = Math.max(0, MAX_LEAVE_DAYS - annualApprovedDaysUsed);

  const selectedTypeLabel = useMemo(() => {
    const found = types.find((t) => String(t?.id ?? "") === String(form.type_conge_id || ""));
    return String(found?.label || "").trim();
  }, [types, form.type_conge_id]);
  const formTypeSelectLabel = useMemo(() => {
    if (selectedTypeLabel) return selectedTypeLabel;
    if (typesLoading) return "Chargement...";
    if (!types.length) return "Aucun type";
    return "Type de congé";
  }, [selectedTypeLabel, typesLoading, types.length]);
  const selectedIsAnnual = useMemo(() => isAnnualLeaveType(selectedTypeLabel), [selectedTypeLabel]);
  const selectedYear = useMemo(() => {
    const iso = String(form.du || "").trim();
    if (!iso) return null;
    const year = Number.parseInt(iso.slice(0, 4), 10);
    return Number.isFinite(year) ? year : null;
  }, [form.du]);
  const selectedYearRemainingAnnualDays = useMemo(() => {
    if (!selectedYear) return annualRemainingDays;
    return Math.max(0, MAX_LEAVE_DAYS - (annualUsedByYear.get(selectedYear) || 0));
  }, [annualRemainingDays, annualUsedByYear, selectedYear]);
  const selectedRequestedAnnualDays = useMemo(() => {
    if (!selectedIsAnnual || !selectedYear || !form.du || !form.au) return 0;
    return annualDaysWithinYear(form.du, form.au, selectedYear);
  }, [form.au, form.du, selectedIsAnnual, selectedYear]);
  const exceedsAnnualBalance = useMemo(
    () => Boolean(selectedIsAnnual && selectedRequestedAnnualDays > selectedYearRemainingAnnualDays),
    [selectedIsAnnual, selectedRequestedAnnualDays, selectedYearRemainingAnnualDays]
  );

  const editSelectedTypeLabel = useMemo(() => {
    const found = types.find((t) => String(t?.id ?? "") === String(editForm.type_conge_id || ""));
    return String(found?.label || "").trim();
  }, [types, editForm.type_conge_id]);
  const editIsAnnual = useMemo(() => isAnnualLeaveType(editSelectedTypeLabel), [editSelectedTypeLabel]);
  const editYear = useMemo(() => {
    const iso = String(editForm.du || "").trim();
    if (!iso) return null;
    const year = Number.parseInt(iso.slice(0, 4), 10);
    return Number.isFinite(year) ? year : null;
  }, [editForm.du]);
  //les jours eli ba9yin fi solde 
  const editYearRemainingAnnualDays = useMemo(() => {
    if (!editYear) return annualRemainingDays;
    return Math.max(0, MAX_LEAVE_DAYS - (annualUsedByYear.get(editYear) || 0));
  }, [annualRemainingDays, annualUsedByYear, editYear]);
  //les jours ilibach isir fihom modification
  const editRequestedAnnualDays = useMemo(() => {
    if (!editIsAnnual || !editYear || !editForm.du || !editForm.au) return 0;
    return annualDaysWithinYear(editForm.du, editForm.au, editYear);
  }, [editForm.au, editForm.du, editIsAnnual, editYear]);
  //nchofo itha modification ilisaritt titjawiz solde annuel wila laa
  const editExceedsAnnualBalance = useMemo(
    () => Boolean(editIsAnnual && editRequestedAnnualDays > editYearRemainingAnnualDays),
    [editIsAnnual, editRequestedAnnualDays, editYearRemainingAnnualDays]
  );

  const loadList = async () => {
    if (!matricule) return;
    setError("");
    try {
      const resp = await fetch(`${API_BASE_URL}/api/conges?matricule=${encodeURIComponent(matricule)}`);
      const data = await resp.json().catch(() => []);
      if (!resp.ok) throw new Error(data?.message || "Impossible de charger les congés.");
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Erreur serveur."); setTimeout(() => setError(""), 4000);
      setList([]);
    }
  };

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matricule]);

  // error after 4s
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  const validate = (values) => {
    const errs = {};
    const today = minLeadISO();
    if (!values.type_conge_id) errs.type_conge_id = "Type requis.";
    if (!values.raison.trim()) errs.raison = "Raison requise.";
    if (!values.du) errs.du = "Date de début requise.";
    else if (values.du < today) errs.du = `Date de début doit être au moins ${MIN_LEAD_DAYS} jours à l'avance.`;
    if (!values.au) errs.au = "Date de fin requise.";
    else if (values.au < today) errs.au = `Date de fin doit être au moins ${MIN_LEAD_DAYS} jours à l'avance.`;
    if (values.du && values.au && values.au < values.du) errs.au = "Fin après le début.";
    return errs;
  };

  const resetForm = () => {
    setForm(buildInitialForm(defaultTypeId));
    setFormErrors({});
    setError("");
    setSuccess("");
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditId(null);
    setEditForm(buildInitialForm(defaultTypeId));
    setEditError("");
    setEditFormErrors({});
  };

  const startEdit = (row) => {
    if (statusLabel(row?.statut) !== "En attente") return;
    const labelCandidate = String(row?.type_conge_label || "").trim();
    const typeMatch = labelCandidate
      ? types.find(
          (t) => String(t?.label || "").trim().toLowerCase() === String(labelCandidate).toLowerCase()
        )
      : null;
    const resolvedTypeId =
      (row?.type_conge_id !== null && typeof row?.type_conge_id !== "undefined" && row?.type_conge_id !== ""
        ? String(row.type_conge_id)
        : typeMatch
          ? String(typeMatch.id)
          : "") || defaultTypeId;
    setEditId(row.id_conge);
    setEditForm({
      type_conge_id: resolvedTypeId || "",
      raison: String(row.raison || "").trim(),
      du: toISO(row.date_debut),
      au: toISO(row.date_fin),
    });
    setEditError("");
    setShowEditModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();//tamna3 refresh lilform
    if (exceedsAnnualBalance) {
      setSuccess("");
      setFormErrors({});
      setError(
        `Solde annuel insuffisant: ${selectedRequestedAnnualDays} j demandés pour ${selectedYear || currentYear} (reste ${selectedYearRemainingAnnualDays} j).`
      );
      return;
    }
    const errs = validate(form);
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      setSuccess("");
      const nonRaison = Object.entries(errs).filter(([key]) => key !== "raison");
      setError(nonRaison.length ? nonRaison[0][1] : ""); setTimeout(() => setError(""), 4000);
      return;
    }
    setFormErrors({});
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const payload = {
        matricule,
        type_conge_id: Number(form.type_conge_id),
        date_debut: form.du,
        date_fin: form.au,
        raison: form.raison.trim(),
      };
      const resp = await fetch(`${API_BASE_URL}/api/conges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, statut: "En attente" }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.message || "Envoi impossible.");
      resetForm();
      await loadList();
      setSuccess("Demande envoyée avec succès."); setTimeout(() => setSuccess(""), 4000);
    } catch (e) {
      setError(e.message || "Erreur serveur."); setTimeout(() => setError(""), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editId) return;
    if (editExceedsAnnualBalance) {
      setEditError(
        `Solde annuel insuffisant: ${editRequestedAnnualDays} j demandés pour ${editYear || currentYear} (reste ${editYearRemainingAnnualDays} j).`
      );
      setEditFormErrors({});
      return;
    }
    const errs = validate(editForm);
    if (Object.keys(errs).length) {
      setEditFormErrors(errs);
      const nonRaison = Object.entries(errs).filter(([key]) => key !== "raison");
      setEditError(nonRaison.length ? nonRaison[0][1] : ""); setTimeout(() => setEditError(""), 4000);
      return;
    }
    setEditFormErrors({});
    setEditError("");
    setSaving(true);
    try {
      const payload = {
        matricule,
        type_conge_id: Number(editForm.type_conge_id),
        date_debut: editForm.du,
        date_fin: editForm.au,
        raison: editForm.raison.trim(),
      };
      const resp = await fetch(`${API_BASE_URL}/api/conges/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.message || "Modification impossible.");
      closeEditModal();
      await loadList();
      setHistorySuccess("Modification effectuée avec succès."); setTimeout(() => setHistorySuccess(""), 4000);
      setHistorySuccessTone("pending");
    } catch (e) {
      setEditError(e.message || "Erreur serveur."); setTimeout(() => setEditError(""), 4000);
    } finally {
      setSaving(false);
    }
  };

  const cancelRequest = async (id) => {
    try {
      setSaving(true);
      const resp = await fetch(`${API_BASE_URL}/api/conges/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut: "Annulé" }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.message || "Annulation impossible.");
      if (editId === id) closeEditModal();
      await loadList();
      setHistorySuccess("Demande annulée avec succès."); setTimeout(() => setHistorySuccess(""), 4000);
      setHistorySuccessTone("canceled");
    } catch (e) {
      setError(e.message || "Erreur serveur."); setTimeout(() => setError(""), 4000);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!typeDropdownOpen) return undefined;
    const handleClickOutside = (event) => {
      const insideCreate = typeDropdownRef.current && typeDropdownRef.current.contains(event.target);
      if (insideCreate) return;
      setTypeDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [typeDropdownOpen]);


  const closeHistoryModal = () => {
    setHistoryOpen(false);
    setHistorySuccess("");
    setHistorySuccessTone("");
  };

  const onDaySelect = (iso) => {
    const min = minLeadISO();
    if (iso < min) return;
    if (!form.du || (form.du && form.au && form.du === form.au)) {
      setForm((prev) => ({ ...prev, du: iso, au: iso }));
      return;
    }
    if (form.du && (!form.au || iso < form.du)) {
      setForm((prev) => ({ ...prev, du: iso, au: prev.au }));
      return;
    }
    setForm((prev) => ({ ...prev, au: iso }));
  };
  //creation mta3 calendrier mta3 chhar al7aliiii
  const calendarDays = useMemo(() => getMonthDays(monthAnchor), [monthAnchor]);

  const dayMap = useMemo(() => {
    const map = new Map();

    for (const row of list) {
      const startIso = toISO(row.date_debut);//toISO(YYYY-MM-DD)
      const endIso = toISO(row.date_fin);
      if (!startIso || !endIso) continue;//itha les deux dates naksinn nitjahlohomm

      const startDate = new Date(`${startIso}T00:00:00`);
      const endDate = new Date(`${endIso}T00:00:00`);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) continue;//itha tarikh 8litt nitjahlohh

      const status = statusLabel(row.statut);
      let guard = 0;
      
      for (let cursor = new Date(startDate); cursor <= endDate && guard < 380; cursor.setDate(cursor.getDate() + 1)) {
        const iso = toISO(cursor);
        const current =
          map.get(iso) ||
          {
            total: 0,
            pending: 0,
            approved: 0,
            refused: 0,
            canceled: 0,
          };

        current.total += 1;
        if (status === "En attente") current.pending += 1;
        if (status === "Approuvé") current.approved += 1;
        if (status === "Refusé") current.refused += 1;
        if (status === "Annulé") current.canceled += 1;

        map.set(iso, current);
        guard += 1;
      }
    }

    return map;
  }, [list]);
  //kol status andha couleur fil calendrier 
  const toneForDay = (info) => {
    if (!info) return "neutral";
    if (info.pending > 0) return "pending";
    if (info.refused > 0) return "refused";
    if (info.approved > 0) return "approved";
    if (info.canceled > 0) return "canceled";
    return "neutral";
  };

  const buildDayTooltip = (info) => {
    if (!info || !info.total) return "";
    const lines = [];
    if (info.pending) lines.push(`${info.pending} congé(s) en attente`);
    if (info.refused) lines.push(`${info.refused} congé(s) refusé(s)`);
    if (info.approved) lines.push(`${info.approved} congé(s) approuvé(s)`);
    if (info.canceled) lines.push(`${info.canceled} congé(s) annulé(s)`);
    return lines.join("\n");
  };
  //asque date ilyouma dakhil fii periode min du hata au
  const inRange = (iso) => {
    if (!form.du || !form.au) return false;
    return iso >= form.du && iso <= form.au;
  };
  const today = todayISO();

  return (
    <div className="admin-card">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="personnel-page-title-wrap">
          <span className="personnel-page-title-line" aria-hidden="true" />
          <div>
            <h3 className="personnel-page-title mb-1">Demande de congé</h3>
            <div className="personnel-page-subtitle">Soumettre une demande et suivre les statuts.</div>
          </div>
        </div>

        <button
          type="button"
          className="btn admin-accent-btn shadow-sm admin-conges-history-trigger"
          onClick={() => {
            setHistoryOpen(true);
          }}
        >
          <span className="admin-conges-history-trigger-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
              <path
                d="M12 7.5v5l3 1.8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          Historique des congés
        </button>
      </div>

      {error && <div className="alert alert-danger py-2 mb-3">{error}</div>}
      {success && <div className="alert alert-success py-2 mb-3">{success}</div>}

      <div className="balance-card balance-wide" aria-label="Solde annuel">
        <div className="balance-top">
          <div className="balance-title">Solde annuel {currentYear}</div>
          <div className="balance-meta">
            <span className="balance-meta-strong">{annualApprovedDaysUsed} j annuels approuvés</span>
            <span className="balance-sep">•</span>
            <span className="balance-meta-soft">{MAX_LEAVE_DAYS} j autorisés</span>
          </div>
        </div>
        <div className="balance-main-row">
          <div className="balance-left">
            <div className="balance-value">{annualRemainingDays}</div>
            <div className="balance-unit">j restants</div>
          </div>
          <div className="balance-progress">
            <div
              className="balance-progress-bar"
              style={{ width: `${Math.min(100, Math.max(0, (annualRemainingDays / MAX_LEAVE_DAYS) * 100))}%` }}
            />
          </div>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <form className="col-lg-6 conges-form" onSubmit={handleSubmit} noValidate>
          <div className="mb-3">
            <label className="form-label">Type de congé *</label>
            <div className="emplois-select" ref={typeDropdownRef}>
              <button
                type="button"
                className={`form-select emplois-select-trigger ${typeDropdownOpen ? "open" : ""}`}
                onClick={() =>
                  setTypeDropdownOpen((prev) => {
                    if (typesLoading || !types.length) return false;
                    const next = !prev;
                    return next;
                  })
                }
                aria-expanded={typeDropdownOpen} 
                disabled={typesLoading || !types.length}
              >
                <span>{formTypeSelectLabel}</span>
                <span className="emplois-select-caret" aria-hidden="true" />
              </button>
              {typeDropdownOpen ? (
                <div className="emplois-select-menu" role="listbox">
                  {typesLoading && !types.length ? (
                    <button className="emplois-select-option disabled" disabled>
                      Chargement...
                    </button>
                  ) : null}
                  {!typesLoading && !types.length ? (
                    <button className="emplois-select-option disabled" disabled>
                      Aucun type
                    </button>
                  ) : null}
                  {types.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`emplois-select-option ${
                        String(form.type_conge_id) === String(t.id) ? "active" : ""
                      }`}
                      onClick={() => {
                        setForm({ ...form, type_conge_id: String(t.id) });
                        setTypeDropdownOpen(false);
                      }}
                      role="option"
                      aria-selected={String(form.type_conge_id) === String(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {typesError ? <div className="form-text text-danger">{typesError}</div> : null}
          </div>
          <div className="row g-3">
            <div className="col-md-6">
                  <label className="form-label">Date de début *</label>
                  <input
                    type="date"
                    className="form-control"
                    min={minLeadISO()}
                    value={form.du}
                    onChange={(e) => setForm({ ...form, du: e.target.value, au: e.target.value })}
                  />
                </div>
            <div className="col-md-6">
              <label className="form-label">Date de fin *</label>
              <input
                type="date"
                className="form-control"
                min={form.du || minLeadISO()}
                value={form.au}
                onChange={(e) => setForm({ ...form, au: e.target.value })}
              />
              {form.du && form.au && (
                <div className={`form-text ${exceedsAnnualBalance ? "text-danger fw-semibold" : ""}`}>
                  {selectedDays} jour(s) sélectionné(s)
                  {selectedIsAnnual ? ` — solde restant ${selectedYearRemainingAnnualDays} j` : ""}
                </div>
              )}
            </div>
          </div>
          <div className="mt-3">
            <label className="form-label">Raison *</label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="Ex: Vacances en famille"
              value={form.raison}
              onChange={(e) => setForm({ ...form, raison: e.target.value })}
            />
            {formErrors?.raison ? <div className="form-text text-danger">{formErrors.raison}</div> : null}
          </div>
          <div className="d-flex gap-2 mt-3">
            <button type="submit" className="btn admin-accent-btn" disabled={saving}>
              {saving ? "Envoi..." : "Envoyer la demande"}
            </button>
            <button
              type="button"
              className="btn conges-cancel-btn"
              onClick={resetForm}
              disabled={saving}
            >
              Annuler
            </button>
          </div>
        </form>

        <div className="col-lg-6 d-flex flex-column gap-3">
          <div className="admin-conges-panel admin-conges-calendar">
            <div className="admin-conges-calendar-head">
              <button
                type="button"
                className="admin-conges-nav-btn"
                onClick={() => setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                aria-label="Mois précédent"
              >
                ‹
              </button>
              <div className="admin-conges-month text-capitalize">{monthLabel(monthAnchor)}</div>
              <button
                type="button"
                className="admin-conges-nav-btn"
                onClick={() => setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                aria-label="Mois suivant"
              >
                ›
              </button>
            </div>

            <div className="admin-conges-legend">
              <span>
                <span className="dot pending" /> En attente
              </span>
              <span>
                <span className="dot approved" /> Approuvé
              </span>
              <span>
                <span className="dot refused" /> Refusé
              </span>
              <span>
                <span className="dot canceled" /> Annulé
              </span>
            </div>

            <div className="admin-conges-cal-weekdays" aria-hidden="true">
              {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
                <div key={d} className="admin-conges-cal-weekday">
                  {d}
                </div>
              ))}
            </div>

            <div className="admin-conges-cal-grid" aria-label="Calendrier">
              {calendarDays.map((day) => {
                const info = dayMap.get(day.iso);//ce jour 3ando conge o non 
                const tone = toneForDay(info);
                const showTone = day.inMonth && tone !== "neutral";
                const isToday = day.iso === today;
                const isPast = day.iso < today;
                const inSel = inRange(day.iso);
                const isRangeStart = Boolean(form.du && day.iso === form.du);
                const isRangeEnd = Boolean(form.au && day.iso === form.au);
                const tooltip = buildDayTooltip(info);//hover 

                return (
                  <button
                    key={day.iso}
                    type="button"
                    className={`admin-conges-cal-day${day.inMonth ? "" : " muted"}${showTone ? ` tone-${tone}` : ""}${
                      inSel ? " range" : ""
                    }${isRangeStart ? " range-start" : ""}${isRangeEnd ? " range-end" : ""}${
                      isRangeStart || isRangeEnd ? " selected" : ""
                    }${isToday ? " today" : ""}`}
                    title={tooltip || undefined}//hover
                    onClick={() => {
                      if (!isPast) onDaySelect(day.iso);
                      if (!day.inMonth) {
                        setMonthAnchor(new Date(day.date.getFullYear(), day.date.getMonth(), 1));
                      }
                    }}
                    disabled={isPast}
                  >
                    <span className="admin-conges-cal-number">{day.label}</span>
                    {info?.total > 1 ? (
                      <span className={`admin-conges-cal-count${showTone ? ` tone-${tone}` : ""}`}>
                        {info.total}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <CongesHistoryModal
        open={historyOpen}
        onClose={closeHistoryModal}
        list={list}
        types={types}
        historySuccess={historySuccess}
        historySuccessTone={historySuccessTone}
        requesterLabel={requesterLabel}
        saving={saving}
        startEdit={startEdit}
        cancelRequest={cancelRequest}
      />

      <CongesEditModal
        open={showEditModal}
        onClose={closeEditModal}
        saving={saving}
        editError={editError}
        onSubmit={handleEditSubmit}
        typesLoading={typesLoading}
        types={types}
        typesError={typesError}
        editForm={editForm}
        setEditForm={setEditForm}
        minLeadISO={minLeadISO}
        annualRemainingDays={annualRemainingDays}
        annualUsedByYear={annualUsedByYear}
        maxLeaveDays={MAX_LEAVE_DAYS}
        editFormErrors={editFormErrors}
        onRequestCloseCreateTypeDropdown={() => setTypeDropdownOpen(false)}
      />
    </div>
  );
}