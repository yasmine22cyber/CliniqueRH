import { useEffect, useMemo, useRef, useState } from "react";

const STATUS_FILTERS = [
  { key: "pending", label: "En attente", status: "En attente" },
  { key: "approved", label: "Approuvés", status: "Approuvé" },
  { key: "refused", label: "Refusés", status: "Refusé" },
  { key: "canceled", label: "Annulés", status: "Annulé" },
];

const normalizeStatus = (value = "") =>
  value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeText = (value = "") => normalizeStatus(value);

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

const diffInDays = (start, end) => {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  const ms = e.getTime() - s.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
};

const displayDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("fr-FR");
  const s = String(value);
  return s.includes("T") ? s.split("T")[0] : s.slice(0, 10);
};

const formatSubmittedLabel = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
};

export default function CongesHistoryModal(props) {
  if (!props.open) return null;
  return <CongesHistoryModalInner {...props} />;
}

function CongesHistoryModalInner({
  onClose,
  list,
  types,
  historySuccess,
  historySuccessTone,
  requesterLabel,
  saving,
  startEdit,
  cancelRequest,
}) {
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [historyTypeFilter, setHistoryTypeFilter] = useState("all");
  const [historyStatusDropdownOpen, setHistoryStatusDropdownOpen] = useState(false);
  const [historyTypeDropdownOpen, setHistoryTypeDropdownOpen] = useState(false);

  const historyStatusDropdownRef = useRef(null);
  const historyTypeDropdownRef = useRef(null);

  const historyTypes = useMemo(() => {
    const labels = (Array.isArray(types) ? types : [])
      .map((t) => String(t?.label || "").trim())
      .filter(Boolean);
    return Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b, "fr"));
  }, [types]);

  const historyStatusLabel = useMemo(() => {
    if (activeStatusFilter === "all") return "Tous les statuts";
    const found = STATUS_FILTERS.find((item) => item.key === activeStatusFilter);
    return found ? found.label : "Tous les statuts";
  }, [activeStatusFilter]);

  const historyTypeLabel = useMemo(
    () => (historyTypeFilter === "all" ? "Tous les types" : historyTypeFilter),
    [historyTypeFilter]
  );

  const sortedList = useMemo(() => {
    const base = Array.isArray(list) ? list : [];
    const sorted = [...base].sort((a, b) => {
      const dA = new Date(a.date_debut || 0).getTime();
      const dB = new Date(b.date_debut || 0).getTime();
      return dB - dA;//min jdid lilkdim
    });

    const byStatus = (() => {
      if (activeStatusFilter === "all") return sorted;
      const activeFilter = STATUS_FILTERS.find((item) => item.key === activeStatusFilter);
      if (!activeFilter) return sorted;
      return sorted.filter((row) => statusLabel(row.statut) === activeFilter.status);
    })();

    if (historyTypeFilter === "all") return byStatus;
    const target = normalizeText(historyTypeFilter);
    return byStatus.filter((row) => {
      const label = String(row?.type_conge_label || "").trim();
      return normalizeText(label) === target;
    });
  }, [list, activeStatusFilter, historyTypeFilter]);

  useEffect(() => {
    if (!historyStatusDropdownOpen && !historyTypeDropdownOpen) return undefined;
    const handleClickOutside = (event) => {
      const insideStatus =
        historyStatusDropdownRef.current &&
        historyStatusDropdownRef.current.contains(event.target);
      const insideType =
        historyTypeDropdownRef.current && historyTypeDropdownRef.current.contains(event.target);
      if (insideStatus || insideType) return;
      setHistoryStatusDropdownOpen(false);
      setHistoryTypeDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [historyStatusDropdownOpen, historyTypeDropdownOpen]);

  return (
    <div
      className="modal-backdrop-soft conges-admin-history-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="modal-card conges-admin-history-modal admin-conges-all-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Fermer">
          ×
        </button>

        <div className="admin-conges-history-head">
          <div className="admin-conges-history-head-left">
            <span className="admin-conges-history-icon" aria-hidden="true" />
            <div>
              <div className="admin-conges-history-title">Historique des demandes</div>
            </div>
          </div>
        </div>

            <div className="admin-conges-history-toolbar">
              <div className="admin-conges-history-filters">
                <div className="emplois-select" ref={historyStatusDropdownRef}>
                  <button
                    type="button"
                    className={`form-select emplois-select-trigger ${
                      historyStatusDropdownOpen ? "open" : ""
                    }`}
                onClick={() =>
                  setHistoryStatusDropdownOpen((prev) => {
                    const next = !prev;
                    if (next) setHistoryTypeDropdownOpen(false);
                    return next;
                  })
                }
                aria-expanded={historyStatusDropdownOpen}
              >
                <span>{historyStatusLabel}</span>
                <span className="emplois-select-caret" aria-hidden="true" />
              </button>
              {historyStatusDropdownOpen ? (
                <div className="emplois-select-menu" role="listbox">
                  <button
                    type="button"
                    className={`emplois-select-option ${
                      activeStatusFilter === "all" ? "active" : ""
                    }`}
                    onClick={() => {
                      setActiveStatusFilter("all");
                      setHistoryStatusDropdownOpen(false);
                    }}
                    role="option"
                    aria-selected={activeStatusFilter === "all"}
                  >
                    Tous les statuts
                  </button>
                  {STATUS_FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      className={`emplois-select-option ${
                        activeStatusFilter === f.key ? "active" : ""
                      }`}
                      onClick={() => {
                        setActiveStatusFilter(f.key);
                        setHistoryStatusDropdownOpen(false);
                      }}
                      role="option"
                      aria-selected={activeStatusFilter === f.key}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

                <div className="emplois-select" ref={historyTypeDropdownRef}>
                  <button
                    type="button"
                    className={`form-select emplois-select-trigger ${
                      historyTypeDropdownOpen ? "open" : ""
                    }`}
                onClick={() =>
                  setHistoryTypeDropdownOpen((prev) => {
                    const next = !prev;
                    if (next) setHistoryStatusDropdownOpen(false);
                    return next;
                  })
                }
                aria-expanded={historyTypeDropdownOpen}
              >
                <span>{historyTypeLabel}</span>
                <span className="emplois-select-caret" aria-hidden="true" />
              </button>
              {historyTypeDropdownOpen ? (
                <div className="emplois-select-menu" role="listbox">
                  <button
                    type="button"
                    className={`emplois-select-option ${
                      historyTypeFilter === "all" ? "active" : ""
                    }`}
                    onClick={() => {
                      setHistoryTypeFilter("all");
                      setHistoryTypeDropdownOpen(false);
                    }}
                    role="option"
                    aria-selected={historyTypeFilter === "all"}
                  >
                    Tous les types
                  </button>
                  {historyTypes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`emplois-select-option ${
                        historyTypeFilter === t ? "active" : ""
                      }`}
                      onClick={() => {
                        setHistoryTypeFilter(t);
                        setHistoryTypeDropdownOpen(false);
                      }}
                      role="option"
                      aria-selected={historyTypeFilter === t}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

                <button
                  type="button"
                  className="admin-conges-history-reset"
                  onClick={() => {
                    setActiveStatusFilter("all");
                    setHistoryTypeFilter("all");
                    setHistoryStatusDropdownOpen(false);
                    setHistoryTypeDropdownOpen(false);
                  }}
                >
                  Réinitialiser
                </button>
              </div>
            </div>

        {historySuccess ? (
          <div
            className={`alert py-2 mb-3 conges-history-flash${
              historySuccessTone ? ` tone-${historySuccessTone}` : ""
            }`}
            role="status"
            aria-live="polite"
          >
            {historySuccess}
          </div>
        ) : null}

        <div className="modal-body-scroll conges-admin-history-body">
          {!sortedList.length ? (
            <div className="text-muted admin-conges-empty">Aucune demande.</div>
          ) : (
            <div className="admin-conges-history-timeline">
              {sortedList.map((row) => {
                const status = statusLabel(row.statut);
                const tone =
                  status === "Approuvé"
                    ? "approved"
                    : status === "Refusé"
                      ? "refused"
                      : status === "Annulé"
                        ? "canceled"
                        : "pending";
                const type = String(row?.type_conge_label || "").trim() || "—";
                const raison = String(row?.raison || "").trim() || "—";
                const startIso = toISO(row.date_debut);
                const endIso = toISO(row.date_fin);
                const days = diffInDays(startIso, endIso);
                const isPending = status === "En attente";

                return (
                  <div
                    key={`all-${row.id_conge}`}
                    id={`personnel-conge-history-${row.id_conge}`}
                    className="admin-conges-history-item"
                  >
                    <div className="admin-conges-history-dot-wrap" aria-hidden="true">
                      <span className={`admin-conges-history-dot tone-${tone}`} />
                    </div>

                    <div className="admin-conges-history-card">
                      <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                        <div>
                          <div className="admin-conges-history-name">{requesterLabel}</div>
                          <div className="admin-conges-history-submitted">
                            Soumis le{" "}
                            {formatSubmittedLabel(
                              row.created_at || row.updated_at || row.date_debut
                            )}
                          </div>
                        </div>
                        <span className={`admin-conges-history-status tone-${tone}`}>{status}</span>
                      </div>

                      <div className="admin-conges-history-mainline">
                        <strong>{type}</strong>{" "}
                        <span className="admin-conges-history-period">
                          du <strong>{displayDate(row.date_debut)}</strong> au{" "}
                          <strong>{displayDate(row.date_fin)}</strong> • <strong>{days}</strong>{" "}
                          jours
                        </span>
                      </div>

                      <div className="admin-conges-history-motif">Raison : {raison}</div>

                      {isPending ? (
                        <div className="admin-conges-history-actions">
                          <button
                            type="button"
                            className="admin-conges-history-btn approve"
                            disabled={saving}
                            onClick={() => startEdit(row)}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            className="admin-conges-history-btn refuse"
                            disabled={saving}
                            onClick={() => cancelRequest(row.id_conge)}
                          >
                            Annuler
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}