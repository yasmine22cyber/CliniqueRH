import { useEffect, useMemo, useState } from "react";
import AdminCongesHistoryModal from "../components/AdminCongesHistoryModal";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : "http://localhost:5000");

const getAuthHeaders = () => {
  const token = localStorage.getItem("authToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const STATUS_TONES = {
  "En attente": "pending",
  "Approuvé": "approved",
  "Refusé": "refused",
  "Annulé": "canceled",
};

const MAX_ANNUAL_LEAVE_DAYS = 30;

const FILTERS = [
  { key: "pending", label: "En attente", status: "En attente", tone: "pending" },
  { key: "approved", label: "Approuvés", status: "Approuvé", tone: "approved" },
  { key: "refused", label: "Refusés", status: "Refusé", tone: "refused" },
  { key: "canceled", label: "Annulés", status: "Annulé", tone: "canceled" },
];

const normalizeStatus = (value = "") =>
  value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeText = (value = "") =>
  value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const statusLabel = (value) => {
  const normalized = normalizeStatus(value);
  if (normalized.startsWith("approuv")) return "Approuvé";
  if (normalized.startsWith("refus")) return "Refusé";
  if (normalized.startsWith("annul")) return "Annulé";
  return "En attente";
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

const formatDate = (value) => {
  if (!value) return "—";
  if (typeof value === "string") {
    const raw = value.trim();
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return asLocalISO(d);
  const s = String(value);
  return s.includes("T") ? s.split("T")[0] : s.slice(0, 10);
};

const formatSubmittedLabel = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
};

const rangesOverlap = (aStart, aEnd, bStart, bEnd) =>
  Boolean(aStart && aEnd && bStart && bEnd && aStart <= bEnd && aEnd >= bStart);

const diffInDays = (startIso, endIso) => {
  if (!startIso || !endIso) return 0;
  const s = new Date(startIso);
  const e = new Date(endIso);
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

const countStatuses = (rows) =>
  rows.reduce(
    (acc, row) => {
      const key = statusLabel(row.statut);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    { "En attente": 0, "Approuvé": 0, "Refusé": 0, "Annulé": 0 }
  );

const getRowTypeLabel = (row) => String(row?.type_conge_label || "").trim();

const getRowRaisonDetail = (row) => String(row?.raison || "").trim();

export default function AdminCongesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [pendingFlashId, setPendingFlashId] = useState(null);
  const [pendingPinnedId, setPendingPinnedId] = useState(null);

  const [serviceOptions, setServiceOptions] = useState([]);
  const [typeOptions, setTypeOptions] = useState([]);
  const [_typesLoading, setTypesLoading] = useState(false);

  const [pendingModalId, setPendingModalId] = useState(null);
  const [allHistoryOpen, setAllHistoryOpen] = useState(false);
  const [allHistorySuccess, setAllHistorySuccess] = useState("");
  const [allHistorySuccessTone, setAllHistorySuccessTone] = useState("");
  const [pendingModalSuccess, setPendingModalSuccess] = useState("");
  const [pendingModalSuccessTone, setPendingModalSuccessTone] = useState("");
  const [allHistoryFilter, setAllHistoryFilter] = useState("all"); // all | pending | approved | refused | canceled
  const [allHistoryType, setAllHistoryType] = useState("all"); // all | <typeLabel>
  const [allHistoryService, setAllHistoryService] = useState("all"); // all | <service>
  const [allHistoryMatricule, setAllHistoryMatricule] = useState(""); // digits only, max 10
  //yhel conge automatiquement via notif
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("nav_intent_v1");
      if (!raw) return;
      const intent = JSON.parse(raw);
      if (intent?.tab !== "conges") return;
      if (intent?.action !== "openCongePending") return;
      const focusId = Number(intent?.focusId);
      if (!Number.isFinite(focusId) || focusId <= 0) return;

      sessionStorage.removeItem("nav_intent_v1");//nfasskho intent bsh ma y3awesh yhel notification ba3ed refresh
      setSelectedId(focusId);
      setPendingModalId(focusId);
      setPendingFlashId(focusId);
      setPendingPinnedId(focusId);
    } catch {
      //
    }
  }, []);
  //ya3mel scroll lel popup de conge
  useEffect(() => {
    if (!pendingModalId) return;
    const el =
      document.getElementById(`pending-item-${pendingModalId}`) ||
      document.getElementById(`conge-item-${pendingModalId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [pendingModalId, rows.length]);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`${API_BASE_URL}/api/conges/admin`, {
        headers: getAuthHeaders(),
      });
      const data = await resp.json().catch(() => []);
      if (!resp.ok) throw new Error(data?.message || "Chargement impossible");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Erreur serveur"); setTimeout(() => setError(""), 4000);
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
          .map((s) => String(s).trim())
          .filter(Boolean);
        const uniqueNames = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "fr"));
        setServiceOptions(uniqueNames);
      } else {
        setServiceOptions([]);
      }
    } catch {
      setServiceOptions([]);
    }
  };

  const loadTypes = async () => {
    setTypesLoading(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/types-conge`);
      const data = await resp.json().catch(() => []);
      if (!resp.ok) throw new Error(data?.message || "Impossible de charger les types.");

      const labels = (Array.isArray(data) ? data : [])
        .map((t) => String(t?.label || "").trim())
        .filter(Boolean);

      setTypeOptions(Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b, "fr")));
    } catch {
      setTypeOptions([]);
    } finally {
      setTypesLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadServices();
    loadTypes();
  }, []);

  const stats = useMemo(() => countStatuses(rows), [rows]);
  //liste de conge en attente mratbin hasseb date mel 9dim lejdid 
  const pendingRows = useMemo(
    () =>
      [...rows]
        .filter((r) => statusLabel(r.statut) === "En attente")
        .sort(
          (a, b) =>
            new Date(a.created_at || a.date_debut || 0) -
            new Date(b.created_at || b.date_debut || 0)
        ),
    [rows]
  );

  const pendingPreviewLimit = 5;
  const pendingPinnedRow = pendingPinnedId ? pendingRows.find((r) => r.id_conge === pendingPinnedId) || null : null;
  const basePendingPreview = pendingRows.slice(0, pendingPreviewLimit);
  const pendingPreviewRows =
    pendingPinnedRow && !basePendingPreview.some((r) => r.id_conge === pendingPinnedRow.id_conge)
      ? [pendingPinnedRow, ...basePendingPreview.slice(0, pendingPreviewLimit - 1)]
      : basePendingPreview;
  const pendingMoreCount = Math.max(0, pendingRows.length - pendingPreviewRows.length);

  const handleAction = async (id, statut) => {
    setSavingId(id);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/conges/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ statut }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.message || "Mise à jour impossible");
      await loadData();
      return true;
    } catch (e) {
      setError(e.message || "Erreur serveur"); setTimeout(() => setError(""), 4000);
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const pendingModalRow = useMemo(
    () => (pendingModalId ? rows.find((r) => r.id_conge === pendingModalId) || null : null),
    [rows, pendingModalId]
  );

  const allHistoryRows = useMemo(() => {
    const sorted = [...rows].sort(
      (a, b) =>
        new Date(b.created_at || b.updated_at || b.date_debut || 0) -
        new Date(a.created_at || a.updated_at || a.date_debut || 0)
    );

    const byStatus = (() => {
      if (allHistoryFilter === "all") return sorted;
      const filter = FILTERS.find((f) => f.key === allHistoryFilter);
      if (!filter) return sorted;
      return sorted.filter((r) => statusLabel(r.statut) === filter.status);
    })();

    const byType = (() => {
      if (allHistoryType === "all") return byStatus;
      return byStatus.filter((r) => (getRowTypeLabel(r) || "").toLowerCase() === String(allHistoryType).toLowerCase());
    })();

    const byService = (() => {
      if (allHistoryService === "all") return byType;
      return byType.filter((r) => normalizeText(r.service_text || "") === normalizeText(allHistoryService));
    })();

    if (allHistoryMatricule.length !== 10) return byService;
    return byService.filter((r) => String(r.matricule || "").replace(/\D/g, "") === allHistoryMatricule);
  }, [rows, allHistoryFilter, allHistoryType, allHistoryService, allHistoryMatricule]);

  const allHistoryTypes = useMemo(() => {
    if (typeOptions.length) return typeOptions;
    const types = rows
      .map((row) => (getRowTypeLabel(row) || "").trim())
      .filter(Boolean);
    return Array.from(new Set(types)).sort((a, b) => a.localeCompare(b, "fr"));
  }, [rows, typeOptions]);

  const allHistoryServices = useMemo(() => {
    if (serviceOptions.length) return serviceOptions;
    const services = rows
      .map((row) => String(row.service_text || "").trim())
      .filter(Boolean);
    return Array.from(new Set(services)).sort((a, b) => a.localeCompare(b, "fr"));
  }, [rows, serviceOptions]);

  useEffect(() => {
    if (!pendingFlashId) return;
    const timer = setTimeout(() => setPendingFlashId(null), 900);
    return () => clearTimeout(timer);
  }, [pendingFlashId]);

  useEffect(() => {
    if (!pendingModalId) return;
    setPendingModalSuccess("");
    setPendingModalSuccessTone("");
  }, [pendingModalId]);

  useEffect(() => {
    if (!allHistorySuccess) return undefined;
    const timer = setTimeout(() => {
      setAllHistorySuccess("");
      setAllHistorySuccessTone("");
    }, 5000);
    return () => clearTimeout(timer);
  }, [allHistorySuccess]);

  useEffect(() => {
    if (!pendingModalSuccess) return undefined;
    const timer = setTimeout(() => {
      setPendingModalSuccess("");
      setPendingModalSuccessTone("");
    }, 3000);
    return () => clearTimeout(timer);
  }, [pendingModalSuccess]);

  const closeAllHistoryModal = () => {
    setAllHistoryOpen(false);
    setAllHistorySuccess("");
    setAllHistorySuccessTone("");
  };

  const handleAllHistoryApprove = async (idConge) => {
    const ok = await handleAction(idConge, "Approuvé");
    if (!ok) return;
    setAllHistorySuccess("Demande approuvée avec succès."); setTimeout(() => setAllHistorySuccess(""), 4000);
    setAllHistorySuccessTone("approved");
  };

  const handleAllHistoryRefuse = async (idConge) => {
    const ok = await handleAction(idConge, "Refusé");
    if (!ok) return;
    setAllHistorySuccess("Demande refusée avec succès."); setTimeout(() => setAllHistorySuccess(""), 4000);
    setAllHistorySuccessTone("refused");
  };

  const handleAllHistoryOverlaySelect = (row, { isPending } = {}) => {
    closeAllHistoryModal();
    setSelectedId(row.id_conge);
    if (isPending) {
      setPendingModalId(row.id_conge);
      setPendingFlashId(row.id_conge);
      setPendingPinnedId(row.id_conge);
    }
  };

  return (
    <div className="admin-card admin-conges-page">
      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <div className="personnel-page-title-wrap">
          <span className="personnel-page-title-line" aria-hidden="true" />
          <div>
            <h3 className="personnel-page-title mb-1">Gestion des Congés</h3>
            <div className="personnel-page-subtitle">
              Valider ou refuser les demandes.
            </div>
          </div>
        </div>

        <div className="d-flex gap-2 flex-wrap align-items-center">
          <button
            type="button"
            className="btn admin-accent-btn shadow-sm admin-conges-history-trigger"
            onClick={() => {
              setAllHistoryFilter("all");
              setAllHistoryType("all");
              setAllHistoryService("all");
              setAllHistoryMatricule("");
              setAllHistoryOpen(true);
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
      </div>

      {error && <div className="alert alert-danger py-2 mb-3">{error}</div>}
      {loading && <div className="text-muted small mb-2">Chargement...</div>}

      <div className="admin-conges-stats mb-3">
        {FILTERS.map((filter) => (
          <div
            key={filter.key}
            className={`admin-conges-stat ${filter.tone}`}
            role="group"
            aria-label={`Total ${filter.label}`}
          >
            <div className="admin-conges-stat-label">{filter.label}</div>
            <div className="admin-conges-stat-value">{stats[filter.status] || 0}</div>
          </div>
        ))}
      </div>

      <div className="admin-conges-board">
        <div className="admin-conges-panel admin-conges-request-detail">
          <div className="admin-conges-pending-section">
            <div className="admin-conges-pending-head">
              <span className="admin-conges-pending-badge">{pendingRows.length}</span>
              <span className="admin-conges-pending-label">Demande(s) en attente</span>
            </div>
            {pendingRows.length === 0 ? (
              <div className="admin-conges-pending-empty">Aucune demande en attente.</div>
            ) : (
              <>
                <div className="admin-conges-pending-list">
                  {pendingPreviewRows.map((row) => {
                    const fullName = `${row.prenom || ""} ${row.nom || ""}`.trim() || row.matricule || "—";
                    const startIso = toISO(row.date_debut);
                    const endIso = toISO(row.date_fin);
                    const type = getRowTypeLabel(row) || "Congé";
                    const days = diffInDays(startIso, endIso);
                    const isActive = selectedId === row.id_conge;
                    const isFlash = pendingFlashId === row.id_conge;
                    return (
                      <div
                        key={`pending-${row.id_conge}`}
                        id={`pending-item-${row.id_conge}`}
                        className={`admin-conges-history-item admin-conges-pending-history-item${isActive ? " active" : ""}${isFlash ? " flash" : ""}`}
                      >
                        <div className="admin-conges-history-dot-wrap" aria-hidden="true">
                          <span className="admin-conges-history-dot tone-pending" />
                        </div>

                        <div className="admin-conges-history-card admin-conges-pending-history-card">
                          <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                            <div>
                              <div className="admin-conges-history-name">{fullName}</div>
                              <div className="admin-conges-history-submitted">
                                Soumis le {formatSubmittedLabel(row.created_at || row.date_debut)}
                              </div>
                            </div>
                            <span className="admin-conges-history-status tone-pending">En attente</span>
                          </div>

                          <div className="admin-conges-history-mainline">
                            <strong>{type}</strong>{" "}
                            <span className="admin-conges-history-period">
                              du <strong>{formatDate(startIso)}</strong> au{" "}
                              <strong>{formatDate(endIso)}</strong> •{" "}
                              <strong>{days}</strong> jours
                            </span>
                          </div>

                          <button
                            type="button"
                            className="admin-conges-history-overlay"
                            onClick={() => {
                              setSelectedId(row.id_conge);
                              setPendingModalId(row.id_conge);
                              setPendingFlashId(row.id_conge);
                              setPendingPinnedId(row.id_conge);
                            }}
                            aria-label={`Ouvrir demande ${row.id_conge}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {pendingMoreCount > 0 ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary w-100 mt-2"
                    onClick={() => {
                      setAllHistoryFilter("pending");
                      setAllHistoryType("all");
                      setAllHistoryService("all");
                      setAllHistoryMatricule("");
                      setAllHistoryOpen(true);
                    }}
                  >
                    Voir tout (+{pendingMoreCount})
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>{/*l'ouverture de popup*/}
      {pendingModalRow ? (() => {
        const row = pendingModalRow;
        const fullName = `${row.prenom || ""} ${row.nom || ""}`.trim() || "—";
        const status = statusLabel(row.statut);
        const tone = STATUS_TONES[status] || "pending";
        const raison = getRowRaisonDetail(row) || "—";
        const type = getRowTypeLabel(row) || "—";
        const startIso = toISO(row.date_debut);
        const endIso = toISO(row.date_fin);
        const isBusy = savingId === row.id_conge;

        const year = startIso ? Number.parseInt(startIso.slice(0, 4), 10) : null;
        const canComputeAnnual = Boolean(year && row.matricule);
        const annualUsedDays =
          canComputeAnnual
            ? rows
                .filter((r) => String(r.matricule || "") === String(row.matricule || ""))
                .filter((r) => r.id_conge !== row.id_conge)
                .filter((r) => statusLabel(r.statut) === "Approuvé")
                .filter((r) => isAnnualLeaveType(getRowTypeLabel(r) || ""))
                .reduce((sum, r) => sum + annualDaysWithinYear(toISO(r.date_debut), toISO(r.date_fin), year), 0)
            : null;
        const annualRemainingDays =
          canComputeAnnual ? Math.max(0, MAX_ANNUAL_LEAVE_DAYS - annualUsedDays) : null;
        const requestedAnnualDays =
          canComputeAnnual ? annualDaysWithinYear(startIso, endIso, year) : 0;
        // Vérifie si la demande dépasse le nombre de jours annuels restants
        const annualWouldExceed =
          Boolean(canComputeAnnual && isAnnualLeaveType(type) && requestedAnnualDays > annualRemainingDays);

        const groupServiceKey =
          row.id_service != null && String(row.id_service).trim() !== ""
            ? String(row.id_service)
            : normalizeText(row.service_text || "");
        const groupGradeKey =
          row.id_grade != null && String(row.id_grade).trim() !== ""
            ? String(row.id_grade)
            : normalizeText(row.grade || "");
        const canComputeGroupOverlap = Boolean(groupServiceKey && groupGradeKey);
        // Trouve les autres demandes qui se chevauchent et qui ont le même service/grade (si possible)
        const overlaps = canComputeGroupOverlap
          ? rows
              .filter((r) => r.id_conge !== row.id_conge)
              .filter((r) => {
                const serviceKey =
                  r.id_service != null && String(r.id_service).trim() !== ""
                    ? String(r.id_service)
                    : normalizeText(r.service_text || "");
                const gradeKey =
                  r.id_grade != null && String(r.id_grade).trim() !== ""
                    ? String(r.id_grade)
                    : normalizeText(r.grade || "");
                return serviceKey === groupServiceKey && gradeKey === groupGradeKey;
              })
              .map((r) => {
                const personName = `${r.prenom || ""} ${r.nom || ""}`.trim();
                const person = personName
                  ? `${personName}${r.matricule ? ` (#${r.matricule})` : ""}`
                  : r.matricule
                  ? `#${r.matricule}`
                  : "—";

                return {
                  ...r,
                  _start: toISO(r.date_debut),
                  _end: toISO(r.date_fin),
                  _status: statusLabel(r.statut),
                  _type: getRowTypeLabel(r) || "—",
                  _person: person,
                };
              })
              .filter((r) => rangesOverlap(startIso, endIso, r._start, r._end))
              .filter((r) => r._status !== "Refusé" && r._status !== "Annulé")
              .sort((a, b) => new Date(a._start || 0) - new Date(b._start || 0))
          : [];
        const overlapPreview = overlaps.slice(0, 3);
        const overlapMore = Math.max(0, overlaps.length - overlapPreview.length);
        return (
          <div
            className="modal-backdrop-soft admin-conges-pending-modal-backdrop"
            role="dialog"
            aria-modal="true"
            onClick={() => {
              setPendingModalId(null);
              setPendingModalSuccess("");
              setPendingModalSuccessTone("");
            }}
          >
            <div
              className="modal-card admin-conges-pending-modal-card"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close */}
              <button
                type="button"
                className="modal-close admin-conges-pmodal-close"
                onClick={() => {
                  setPendingModalId(null);
                  setPendingModalSuccess("");
                  setPendingModalSuccessTone("");
                }}
                aria-label="Fermer"
              >
                ×
              </button>

              {/*  HEADER  */}
              <div className="admin-conges-pmodal-header">
                <div className="admin-conges-pmodal-header-left">
                  <div className="admin-conges-pmodal-avatar" aria-hidden="true">
                    {fullName.trim().split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("")}
                  </div>
                  <div className="admin-conges-pmodal-header-meta">
                    <div className="admin-conges-pmodal-fullname">{fullName}</div>
                    <div className="admin-conges-pmodal-header-sub">
                      {row.service_text ? <span>{row.service_text}</span> : null}
                      {row.matricule ? <span className="admin-conges-pmodal-mat">#{row.matricule}</span> : null}
                    </div>
                  </div>
                </div>
                <div className="admin-conges-pmodal-header-right">
                  <span className={`admin-conges-pmodal-status tone-${tone}`}>{status}</span>
                  <div className="admin-conges-pmodal-id">Réf. #{row.id_conge}</div>
                  <div className="admin-conges-pmodal-submitted">
                    Soumis le {formatSubmittedLabel(row.created_at || row.date_debut)}
                  </div>
                </div>
              </div>

              {/* PERIODE HERO  */}
              <div className="admin-conges-pmodal-period-hero">
                <div className="admin-conges-pmodal-period-block">
                  <div className="admin-conges-pmodal-period-label">Début</div>
                  <div className="admin-conges-pmodal-period-date">{formatDate(startIso)}</div>
                </div>
                <div className="admin-conges-pmodal-period-arrow" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="admin-conges-pmodal-period-block">
                  <div className="admin-conges-pmodal-period-label">Fin</div>
                  <div className="admin-conges-pmodal-period-date">{formatDate(endIso)}</div>
                </div>
                <div className="admin-conges-pmodal-period-sep" aria-hidden="true" />
                <div className="admin-conges-pmodal-period-block center">
                  <div className="admin-conges-pmodal-period-count">{diffInDays(startIso, endIso)}</div>
                  <div className="admin-conges-pmodal-period-label">jour(s)</div>
                </div>
              </div>

              {/* BODY  */}
              <div className="admin-conges-pmodal-body">

                {pendingModalSuccess ? (
                  <div
                    className={`conges-history-flash${pendingModalSuccessTone ? ` tone-${pendingModalSuccessTone}` : ""}`}
                    role="status"
                    aria-live="polite"
                  >
                    {pendingModalSuccess}
                  </div>
                ) : null}

                {/* Ligne 1 : Type */}
                <div className="admin-conges-pmodal-row">
                  <div className="admin-conges-pmodal-row-icon" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="admin-conges-pmodal-row-label">Type de congé</div>
                  <div className="admin-conges-pmodal-row-value">{type}</div>
                </div>

                {/* Ligne 2 : Solde annuel */}
                {canComputeAnnual ? (
                  <div className={`admin-conges-pmodal-row${annualWouldExceed ? " warn" : ""}`}>
                    <div className="admin-conges-pmodal-row-icon" aria-hidden="true">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
                        <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div className="admin-conges-pmodal-row-label">Solde annuel {year}</div>
                    <div className="admin-conges-pmodal-row-value">
                      <span className="admin-conges-pmodal-balance-pill">
                        {annualRemainingDays} j restant(s)
                      </span>
                      <span className="admin-conges-pmodal-balance-meta">
                        {annualUsedDays} / {MAX_ANNUAL_LEAVE_DAYS} j utilisés
                        {isAnnualLeaveType(type) ? ` · demande : ${requestedAnnualDays} j` : ""}
                      </span>
                      {annualWouldExceed ? (
                        <span className="admin-conges-pmodal-balance-warn">
                          ⚠ Dépasse le solde restant
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* Ligne 3 : Chevauchement */}
                <div className={`admin-conges-pmodal-row overlap-row${overlaps.length ? " warn" : ""}`}>
                  <div className="admin-conges-pmodal-row-icon" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="4" width="8" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
                      <rect x="13" y="6" width="8" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </div>
                  <div className="admin-conges-pmodal-row-label">Chevauchement</div>
                  <div className="admin-conges-pmodal-row-value">
                    {overlaps.length === 0 ? (
                      <span className="admin-conges-pmodal-overlap-none">Aucun</span>
                    ) : (
                      <>
                        <span className="admin-conges-pmodal-overlap-count">
                          {overlaps.length} congé(s) (même service et même grade) sur la même période
                        </span>
                        <div className="admin-conges-pmodal-overlaps">
                          {overlapPreview.map((o) => (
                            <div key={`overlap-${o.id_conge}`} className="admin-conges-pmodal-overlap-row">
                              <span className={`admin-conges-pmodal-overlap-status tone-${STATUS_TONES[o._status] || "pending"}`}>
                                {o._status}
                              </span>
                              <span className="admin-conges-pmodal-overlap-text">
                                #{o.id_conge} · {o._person} · {o._type} · {formatDate(o._start)} → {formatDate(o._end)}
                              </span>
                            </div>
                          ))}
                          {overlapMore ? (
                            <div className="admin-conges-pmodal-overlap-more">+ {overlapMore} autre(s)</div>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Ligne 4 : Raison */}
                <div className="admin-conges-pmodal-row motif-row">
                  <div className="admin-conges-pmodal-row-icon" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M4 6h16M4 10h16M4 14h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="admin-conges-pmodal-row-label">Raison</div>
                  <div className="admin-conges-pmodal-motif-box">{raison}</div>
                </div>

              </div>

              {/*  ACTIONS  */}
              <div className="admin-conges-pmodal-actions">
                <button
                  type="button"
                  className="admin-conges-pmodal-btn refuse"
                  disabled={isBusy}//boutton yit3atall bach maysirich double click 
                  onClick={async () => {
                    const ok = await handleAction(row.id_conge, "Refusé");
                    if (!ok) return;
                    setPendingModalSuccess("Demande refusée avec succès."); setTimeout(() => setPendingModalSuccess(""), 4000);
                    setPendingModalSuccessTone("refused");
                    setTimeout(() => setPendingModalId(null), 1200);
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                  {isBusy ? "…" : "Refuser"}
                </button>
                <button
                  type="button"
                  className="admin-conges-pmodal-btn approve"
                  disabled={isBusy}
                  onClick={async () => {
                    const ok = await handleAction(row.id_conge, "Approuvé");
                    if (!ok) return;
                    setPendingModalSuccess("Demande approuvée avec succès."); setTimeout(() => setPendingModalSuccess(""), 4000);
                    setPendingModalSuccessTone("approved");
                    setTimeout(() => setPendingModalId(null), 1200);
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {isBusy ? "…" : "Approuver"}
                </button>
              </div>
            </div>
          </div>
        );
      })() : null}

      <AdminCongesHistoryModal
        open={allHistoryOpen}
        onClose={closeAllHistoryModal}
        success={allHistorySuccess}
        successTone={allHistorySuccessTone}
        filter={allHistoryFilter}
        setFilter={setAllHistoryFilter}
        typeValue={allHistoryType}
        setTypeValue={setAllHistoryType}
        serviceValue={allHistoryService}
        setServiceValue={setAllHistoryService}
        matricule={allHistoryMatricule}
        setMatricule={setAllHistoryMatricule}
        filterOptions={FILTERS}
        typeOptions={allHistoryTypes}
        serviceOptions={allHistoryServices}
        rows={allHistoryRows}
        selectedId={selectedId}
        savingId={savingId}
        statusLabel={statusLabel}
        STATUS_TONES={STATUS_TONES}
        getRowTypeLabel={getRowTypeLabel}
        getRowRaisonDetail={getRowRaisonDetail}
        toISO={toISO}
        diffInDays={diffInDays}
        formatSubmittedLabel={formatSubmittedLabel}
        formatDate={formatDate}
        onApprove={handleAllHistoryApprove}
        onRefuse={handleAllHistoryRefuse}
        onOverlaySelect={handleAllHistoryOverlaySelect}
      />
    </div>
  );
}