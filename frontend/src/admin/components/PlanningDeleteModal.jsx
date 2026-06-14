import { useEffect, useMemo, useRef, useState } from "react";

const normalizeDateValue = (value) => {
  if (!value) return "";
  const str = String(value);
  return str.length >= 10 ? str.slice(0, 10) : str;
};

const formatDeleteDateLabel = (isoDate) => {
  const value = normalizeDateValue(isoDate);
  if (!value) return "--";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export function PlanningDeleteModal(props) {
  if (!props.open || !props.target) return null;
  return <PlanningDeleteModalInner {...props} />;
}

function PlanningDeleteModalInner({
  target,
  onClose,
  busy,
  error,
  onConfirm,
}) {
  const [deleteMode, setDeleteMode] = useState("week");
  const [dayDropdownOpen, setDayDropdownOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const dayDropdownRef = useRef(null);

  const dayOptions = useMemo(() => {
    if (!target?.entries?.length) return [];
    const byDate = new Map();
    target.entries.forEach((entry) => {
      const iso = normalizeDateValue(entry?.date);
      if (!iso) return;
      const current = byDate.get(iso) || { date: iso, count: 0 };
      current.count += 1;
      byDate.set(iso, current);
    });
    return Array.from(byDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }, [target]);

  const effectiveSelectedDate = selectedDate || dayOptions[0]?.date || "";

  const selectedDayLabel = useMemo(() => {
    if (!dayOptions.length) return "--";
    const selected =
      dayOptions.find((opt) => opt.date === effectiveSelectedDate) ||
      dayOptions[0];
    return `${formatDeleteDateLabel(selected.date)} (${selected.count} planning(s))`;
  }, [dayOptions, effectiveSelectedDate]);

  const entriesCount = useMemo(() => {
    if (!target?.entries?.length) return 0;
    if (deleteMode !== "day") return target.entries.length;
    const iso = normalizeDateValue(effectiveSelectedDate);
    if (!iso) return 0;
    return target.entries.filter(
      (entry) => normalizeDateValue(entry?.date) === iso,
    ).length;
  }, [deleteMode, effectiveSelectedDate, target]);

  const handleClose = () => {
    if (busy) return;
    setDayDropdownOpen(false);
    onClose?.();
  };

  useEffect(() => {
    if (!dayDropdownOpen) return undefined;
    const handleDocMouseDown = (event) => {
      if (!dayDropdownRef.current) return;
      if (dayDropdownRef.current.contains(event.target)) return;
      setDayDropdownOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setDayDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleDocMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dayDropdownOpen]);

  return (
    <div
      className="modal-backdrop-soft"
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div
        className="modal-card personnel-delete-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="personnel-delete-header">
          <span className="personnel-delete-icon">!</span>
          <span className="personnel-delete-title">Supprimer Emploi Du Temps</span>
          <button
            type="button"
            className="personnel-delete-close"
            onClick={handleClose}
            disabled={busy}
            aria-label="Fermer"
          >
            {"\u00D7"}
          </button>
        </div>
        <div className="personnel-delete-body">
          Choisir le mode de suppression pour ce personnel.
        </div>
        {error ? (
          <div className="alert alert-danger py-2 mb-3">{error}</div>
        ) : null}
        <div className="personnel-delete-scope">
          <div className="personnel-delete-scope-options">
            <label className="personnel-delete-scope-option">
              <input
                type="radio"
                name="row-delete-mode"
                checked={deleteMode === "week"}
                onChange={() => {
                  setDeleteMode("week");
                  setDayDropdownOpen(false);
                }}
                disabled={busy}
              />
              <span>Par semaine</span>
            </label>
            <label className="personnel-delete-scope-option">
              <input
                type="radio"
                name="row-delete-mode"
                checked={deleteMode === "day"}
                onChange={() => {
                  setDeleteMode("day");
                  setDayDropdownOpen(false);
                  if (!selectedDate) setSelectedDate(dayOptions[0]?.date || "");
                }}
                disabled={busy}
              />
              <span>Par jour</span>
            </label>
          </div>
          {deleteMode === "day" ? (
            <div
              className="emplois-select personnel-delete-day-picker"
              ref={dayDropdownRef}
            >
              <button
                type="button"
                className={`form-select emplois-select-trigger personnel-delete-day-trigger ${
                  dayDropdownOpen ? "open" : ""
                }`}
                onClick={() => setDayDropdownOpen((prev) => !prev)}
                disabled={busy || !(dayOptions || []).length}
                aria-expanded={dayDropdownOpen}
              >
                <span>{selectedDayLabel}</span>
                <span className="emplois-select-caret" aria-hidden="true" />
              </button>
              {dayDropdownOpen ? (
                <div
                  className="emplois-select-menu personnel-delete-day-list"
                  role="listbox"
                  aria-label="Choisir un jour"
                >
                  {(dayOptions || []).map((opt) => (
                    <button
                      key={opt.date}
                      type="button"
                      className={`emplois-select-option personnel-delete-day-option ${
                        opt.date === effectiveSelectedDate ? "active" : ""
                      }`}
                      onClick={() => {
                        setSelectedDate(opt.date);
                        setDayDropdownOpen(false);
                      }}
                      disabled={busy}
                      role="option"
                      aria-selected={opt.date === effectiveSelectedDate}
                    >
                      {formatDeleteDateLabel(opt.date)} ({opt.count}{" "}
                      planning(s))
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="personnel-delete-summary">
          <div className="fw-semibold">{target.person.name}</div>
          <div className="small text-muted">
            {target.person.matricule || "-"} | {entriesCount} planning(s){" "}
            {deleteMode === "day"
              ? `a supprimer pour ${formatDeleteDateLabel(effectiveSelectedDate)}`
              : "a supprimer cette semaine"}
          </div>
        </div>
        <div className="personnel-delete-actions">
          <button
            type="button"
            className="btn service-delete-cancel-btn"
            onClick={handleClose}
            disabled={busy}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn services-delete-confirm-btn"
            onClick={() =>
              onConfirm?.({ mode: deleteMode, date: effectiveSelectedDate })
            }
            disabled={busy || !entriesCount}
          >
            {busy ? "Suppression..." : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}