import { useEffect, useMemo, useRef, useState } from "react";

const STATUS_FILTERS = [
  { key: "pending", label: "En attente", status: "En attente" },
  { key: "approved", label: "Approuvés", status: "Approuvé" },
  { key: "refused", label: "Refusés", status: "Refusé" },
  { key: "canceled", label: "Annulés", status: "Annulé" },
];

const normalizeText = (value = "") =>
  value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeDateValue = (value) => {
  if (!value) return "";
  const str = String(value).trim();
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : str.slice(0, 10);
};

const statusLabel = (value) => {
  const normalized = normalizeText(value);
  if (normalized.startsWith("approuv")) return "Approuvé";
  if (normalized.startsWith("refus")) return "Refusé";
  if (normalized.startsWith("annul")) return "Annulé";
  return "En attente";
};

const normalizeShiftLabel = (value = "") => {
  const raw = (value || "").toString().trim();
  if (!raw) return "";
  const key = normalizeText(raw);
  if (key.includes("apres")) return "Apres-midi";
  if (key.includes("garde")) return "Garde";
  if (key.includes("matin")) return "Matin";
  return raw;
};

const displayDate = (value) => {
  const iso = normalizeDateValue(value);
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("fr-FR");
  return iso;
};

const formatSubmittedLabel = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
};

const toneKey = (label) => {
  if (label === "Approuvé") return "approved";
  if (label === "Refusé") return "refused";
  if (label === "Annulé") return "canceled";
  return "pending";
};

export default function PlanningRequestHistoryModal(props) {
  if (!props.open) return null;
  return <PlanningRequestHistoryModalInner {...props} />;
}

function PlanningRequestHistoryModalInner({
  onClose,
  list,
  historySuccess,
  historySuccessTone,
  historyError,
  historyLoading,
  historyBusyId,
  onEditRequest,
  onCancelRequest,
}) {
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [shiftDropdownOpen, setShiftDropdownOpen] = useState(false);

  const statusDropdownRef = useRef(null);
  const shiftDropdownRef = useRef(null);

  const shiftOptions = useMemo(() => {
    const base = Array.isArray(list) ? list : [];
    const labels = base
      .map((row) => normalizeShiftLabel(row?.shift_type))
      .filter(Boolean);
    return Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b, "fr"));
  }, [list]);

  const statusLabelUi = useMemo(() => {
    if (activeStatusFilter === "all") return "Tous les statuts";
    const found = STATUS_FILTERS.find((item) => item.key === activeStatusFilter);
    return found ? found.label : "Tous les statuts";
  }, [activeStatusFilter]);

  const shiftLabelUi = useMemo(
    () => (shiftFilter === "all" ? "Tous les shifts" : shiftFilter),
    [shiftFilter]
  );

  const filteredList = useMemo(() => {
    const base = Array.isArray(list) ? list : [];
    const sorted = [...base].sort((a, b) => {
      const aIso = normalizeDateValue(a?.date_preferee);
      const bIso = normalizeDateValue(b?.date_preferee);
      const aTime = aIso ? new Date(`${aIso}T00:00:00`).getTime() : 0;
      const bTime = bIso ? new Date(`${bIso}T00:00:00`).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;

      const aStamp = new Date(a?.updated_at || a?.created_at || 0).getTime() || 0;
      const bStamp = new Date(b?.updated_at || b?.created_at || 0).getTime() || 0;
      return bStamp - aStamp;
    });

    const byStatus = (() => {
      if (activeStatusFilter === "all") return sorted;
      const filter = STATUS_FILTERS.find((item) => item.key === activeStatusFilter);
      if (!filter) return sorted;
      return sorted.filter((row) => statusLabel(row?.statut || row?.status) === filter.status);
    })();

    if (shiftFilter === "all") return byStatus;
    const target = normalizeText(shiftFilter);
    return byStatus.filter((row) => normalizeText(normalizeShiftLabel(row?.shift_type)) === target);
  }, [list, activeStatusFilter, shiftFilter]);

  useEffect(() => {
    if (!statusDropdownOpen && !shiftDropdownOpen) return undefined;
    const handleClickOutside = (event) => {
      const insideStatus =
        statusDropdownRef.current && statusDropdownRef.current.contains(event.target);
      const insideShift = shiftDropdownRef.current && shiftDropdownRef.current.contains(event.target);
      if (insideStatus || insideShift) return;
      setStatusDropdownOpen(false);
      setShiftDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [statusDropdownOpen, shiftDropdownOpen]);

  return (
    <div className="modal-backdrop-soft" role="dialog" aria-modal="true" onClick={onClose}>
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
            <div className="emplois-select" ref={statusDropdownRef}>
              <button
                type="button"
                className={`form-select emplois-select-trigger ${statusDropdownOpen ? "open" : ""}`}
                onClick={() =>
                  setStatusDropdownOpen((prev) => {
                    const next = !prev;
                    if (next) setShiftDropdownOpen(false);
                    return next;
                  })
                }
                aria-expanded={statusDropdownOpen}
              >
                <span>{statusLabelUi}</span>
                <span className="emplois-select-caret" aria-hidden="true" />
              </button>
              {statusDropdownOpen ? (
                <div className="emplois-select-menu" role="listbox">
                  <button
                    type="button"
                    className={`emplois-select-option ${activeStatusFilter === "all" ? "active" : ""}`}
                    onClick={() => {
                      setActiveStatusFilter("all");
                      setStatusDropdownOpen(false);
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
                      className={`emplois-select-option ${activeStatusFilter === f.key ? "active" : ""}`}
                      onClick={() => {
                        setActiveStatusFilter(f.key);
                        setStatusDropdownOpen(false);
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

            <div className="emplois-select" ref={shiftDropdownRef}>
              <button
                type="button"
                className={`form-select emplois-select-trigger ${shiftDropdownOpen ? "open" : ""}`}
                onClick={() =>
                  setShiftDropdownOpen((prev) => {
                    const next = !prev;
                    if (next) setStatusDropdownOpen(false);
                    return next;
                  })
                }
                aria-expanded={shiftDropdownOpen}
              >
                <span>{shiftLabelUi}</span>
                <span className="emplois-select-caret" aria-hidden="true" />
              </button>
              {shiftDropdownOpen ? (
                <div className="emplois-select-menu" role="listbox">
                  <button
                    type="button"
                    className={`emplois-select-option ${shiftFilter === "all" ? "active" : ""}`}
                    onClick={() => {
                      setShiftFilter("all");
                      setShiftDropdownOpen(false);
                    }}
                    role="option"
                    aria-selected={shiftFilter === "all"}
                  >
                    Tous les shifts
                  </button>
                  {shiftOptions.map((shift) => (
                    <button
                      key={shift}
                      type="button"
                      className={`emplois-select-option ${shiftFilter === shift ? "active" : ""}`}
                      onClick={() => {
                        setShiftFilter(shift);
                        setShiftDropdownOpen(false);
                      }}
                      role="option"
                      aria-selected={shiftFilter === shift}
                    >
                      {shift}
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
                setShiftFilter("all");
                setStatusDropdownOpen(false);
                setShiftDropdownOpen(false);
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

        {historyError ? <div className="alert alert-danger py-2 mb-3">{historyError}</div> : null}

        <div className="modal-body-scroll conges-admin-history-body">
          {historyLoading ? <div className="text-muted">Chargement...</div> : null}
          {!historyLoading && !filteredList.length ? (
            <div className="text-muted admin-conges-empty">Aucune demande.</div>
          ) : (
            <div className="admin-conges-history-timeline">
              {filteredList.map((row) => {
                const label = statusLabel(row?.statut || row?.status);
                const tone = toneKey(label);
                const isPending = label === "En attente";
                const isBusy = historyBusyId === row?.id;
                const createdStamp = new Date(row?.created_at || 0).getTime();
                const updatedStamp = new Date(row?.updated_at || 0).getTime();
                const wasModified =
                  Boolean(row?.created_at) &&
                  Boolean(row?.updated_at) &&
                  Number.isFinite(createdStamp) &&
                  Number.isFinite(updatedStamp) &&
                  updatedStamp > createdStamp + 1000;

                return (
                  <div
                    key={row?.id}
                    id={`personnel-planning-request-${row?.id}`}
                    className="admin-conges-history-item"
                  >
                    <div className="admin-conges-history-dot-wrap" aria-hidden="true">
                      <span className={`admin-conges-history-dot tone-${tone}`} />
                    </div>

                    <div className="admin-conges-history-card">
                      <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                        <div>
                          <div className="admin-conges-history-name">Demande de modification</div>
                          <div className="admin-conges-history-submitted">
                            Soumis le {formatSubmittedLabel(row?.created_at || row?.updated_at)}
                            {wasModified
                              ? ` • Modifie le ${formatSubmittedLabel(row?.updated_at)}`
                              : ""}
                          </div>
                        </div>
                        <span className={`admin-conges-history-status tone-${tone}`}>{label}</span>
                      </div>

                      <div className="admin-conges-history-mainline">
                        <strong>{displayDate(row?.date_preferee)}</strong>{" "}
                        <span className="admin-conges-history-period">
                          • Shift <strong>{normalizeShiftLabel(row?.shift_type) || "—"}</strong>
                        </span>
                      </div>

                      <div className="admin-conges-history-motif">
                        Raison : {(row?.raison || "").toString().trim() || "—"}
                      </div>

                      {isPending ? (
                        <div className="admin-conges-history-actions">
                          <button
                            type="button"
                            className="admin-conges-history-btn approve"
                            disabled={isBusy}
                            onClick={() => onEditRequest(row)}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            className="admin-conges-history-btn refuse"
                            disabled={isBusy}
                            onClick={() => onCancelRequest(row)}
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