import { useEffect, useMemo, useRef, useState } from "react";

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
        if (opt && typeof opt === "object") {
          return { value: String(opt.value), label: String(opt.label) };
        }
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

export default function AdminCongesHistoryModal({
  open,
  onClose,
  success,
  successTone,
  filter,
  setFilter,
  typeValue,
  setTypeValue,
  serviceValue,
  setServiceValue,
  matricule,
  setMatricule,
  filterOptions,
  typeOptions,
  serviceOptions,
  rows,
  selectedId,
  savingId,
  statusLabel,
  STATUS_TONES,
  getRowTypeLabel,
  getRowRaisonDetail,
  toISO,
  diffInDays,
  formatSubmittedLabel,
  formatDate,
  onApprove,
  onRefuse,
  onOverlaySelect,
}) {
  if (!open) return null;

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
            <FilterSelect
              value={filter}
              onChange={(next) => setFilter(next)}
              options={Array.isArray(filterOptions) ? filterOptions.map((f) => ({ value: f.key, label: f.label })) : []}
              allLabel="Tous les statuts"
              allValue="all"
              ariaLabel="Filtre statut"
            />

            <FilterSelect
              value={typeValue}
              onChange={(next) => setTypeValue(next)}
              options={typeOptions}
              allLabel="Tous les types"
              allValue="all"
              ariaLabel="Filtre type"
            />

            <FilterSelect
              value={serviceValue}
              onChange={(next) => setServiceValue(next)}
              options={serviceOptions}
              allLabel="Tous les services"
              allValue="all"
              ariaLabel="Filtre service"
            />

            <div className="admin-conges-history-matricule-wrap">
              <input
                className="admin-conges-history-input"
                placeholder="Matricule (10 chiffres)"
                inputMode="numeric"
                value={matricule}
                onChange={(e) =>
                  setMatricule(String(e.target.value || "").replace(/\D/g, "").slice(0, 10))
                }
                aria-label="Recherche matricule"
              />
              {matricule.length > 0 && matricule.length !== 10 ? (
                <div className="admin-conges-history-help">10 chiffres requis</div>
              ) : null}
            </div>

            <button
              type="button"
              className="admin-conges-history-reset"
              onClick={() => {
                setFilter("all");
                setTypeValue("all");
                setServiceValue("all");
                setMatricule("");
              }}
            >
              Réinitialiser
            </button>
          </div>
        </div>

        {success ? (
          <div
            className={`conges-history-flash${successTone ? ` tone-${successTone}` : ""}`}
            role="status"
            aria-live="polite"
          >
            {success}
          </div>
        ) : null}

        <div className="modal-body-scroll conges-admin-history-body">
          {!rows.length ? (
            <div className="text-muted">Aucune demande.</div>
          ) : (
            <div className="admin-conges-history-timeline">
              {rows.map((row) => {
                const fullName =
                  `${row.prenom || ""} ${row.nom || ""}`.trim() || row.matricule;
                const status = statusLabel(row.statut);
                const tone = STATUS_TONES[status] || "pending";
                const type = getRowTypeLabel(row) || "—";
                const raison = getRowRaisonDetail(row) || "—";
                const startIso = toISO(row.date_debut);
                const endIso = toISO(row.date_fin);
                const days = diffInDays(startIso, endIso);
                const isActive = selectedId === row.id_conge;
                const isPending = status === "En attente";
                const isBusy = savingId === row.id_conge;

                return (
                  <div
                    key={`all-${row.id_conge}`}
                    className={`admin-conges-history-item ${isActive ? "active" : ""}`}
                  >
                    <div className="admin-conges-history-dot-wrap" aria-hidden="true">
                      <span className={`admin-conges-history-dot tone-${tone}`} />
                    </div>

                    <div className="admin-conges-history-card">
                      <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                        <div>
                          <div className="admin-conges-history-name">{fullName}</div>
                          <div className="admin-conges-history-submitted">
                            Soumis le{" "}
                            {formatSubmittedLabel(row.created_at || row.updated_at || row.date_debut)}
                          </div>
                        </div>
                        <span className={`admin-conges-history-status tone-${tone}`}>{status}</span>
                      </div>

                      <div className="admin-conges-history-mainline">
                        <strong>{type}</strong>{" "}
                        <span className="admin-conges-history-period">
                          du <strong>{formatDate(row.date_debut)}</strong> au{" "}
                          <strong>{formatDate(row.date_fin)}</strong> •{" "}
                          <strong>{days}</strong> jours
                        </span>
                      </div>

                      <div className="admin-conges-history-motif">Raison : {raison}</div>

                      <div className="admin-conges-history-tags">
                        {row.service_text ? (
                          <span className="admin-conges-tag">{row.service_text}</span>
                        ) : null}
                        {row.matricule ? (
                          <span className="admin-conges-tag">Matricule: {row.matricule}</span>
                        ) : null}
                      </div>

                      {isPending ? (
                        <div className="admin-conges-history-actions">
                          <button
                            type="button"
                            className="admin-conges-history-btn approve"
                            disabled={isBusy}
                            onClick={() => onApprove(row.id_conge)}
                          >
                            Approuver
                          </button>
                          <button
                            type="button"
                            className="admin-conges-history-btn refuse"
                            disabled={isBusy}
                            onClick={() => onRefuse(row.id_conge)}
                          >
                            Refuser
                          </button>
                        </div>
                      ) : null}

                      <button
                        type="button"
                        className="admin-conges-history-overlay"
                        onClick={() => onOverlaySelect(row, { isPending })}
                        aria-label={`Sélectionner demande ${row.id_conge}`}
                      />
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