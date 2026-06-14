import { useEffect, useMemo, useRef, useState } from "react";

const diffInDays = (start, end) => {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  const ms = e.getTime() - s.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
};

const normalizeText = (value = "") =>
  value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

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

export default function CongesEditModal(props) {
  if (!props.open) return null;
  return <CongesEditModalInner {...props} />;
}

function CongesEditModalInner({
  onClose,
  saving,
  editError,
  onSubmit,
  typesLoading,
  types,
  typesError,
  editForm,
  setEditForm,
  minLeadISO,
  annualRemainingDays,
  annualUsedByYear,
  maxLeaveDays = 30,
  editFormErrors,
  onRequestCloseCreateTypeDropdown,
}) {
  const [editTypeDropdownOpen, setEditTypeDropdownOpen] = useState(false);
  const editTypeDropdownRef = useRef(null);

  const editTypeLabel = useMemo(() => {
    const found = (Array.isArray(types) ? types : []).find(
      (t) => String(t?.id ?? "") === String(editForm.type_conge_id || "")
    );
    return String(found?.label || "").trim();
  }, [types, editForm.type_conge_id]);

  const editTypeSelectLabel = useMemo(() => {
    if (editTypeLabel) return editTypeLabel;
    if (typesLoading) return "Chargement...";
    if (!Array.isArray(types) || !types.length) return "Aucun type";
    return "Type de congé";
  }, [editTypeLabel, typesLoading, types]);

  const editSelectedDays = useMemo(
    () => (editForm.du && editForm.au ? diffInDays(editForm.du, editForm.au) : 0),
    [editForm.du, editForm.au]
  );

  const editIsAnnual = useMemo(() => isAnnualLeaveType(editTypeLabel), [editTypeLabel]);

  const editYear = useMemo(() => {
    const iso = String(editForm.du || "").trim();
    if (!iso) return null;
    const year = Number.parseInt(iso.slice(0, 4), 10);
    return Number.isFinite(year) ? year : null;
  }, [editForm.du]);
  //9adash 93ad lilpersonnel min nhar fil conge annuel
  const editYearRemainingAnnualDays = useMemo(() => {
    if (!editYear) return annualRemainingDays;
    const used = annualUsedByYear instanceof Map ? annualUsedByYear.get(editYear) || 0 : 0;
    return Math.max(0, maxLeaveDays - used);
  }, [annualRemainingDays, annualUsedByYear, editYear, maxLeaveDays]);

  const editRequestedAnnualDays = useMemo(() => {
    if (!editIsAnnual || !editYear || !editForm.du || !editForm.au) return 0;
    return annualDaysWithinYear(editForm.du, editForm.au, editYear);
  }, [editForm.au, editForm.du, editIsAnnual, editYear]);

  const editExceedsAnnualBalance = useMemo(
    () => Boolean(editIsAnnual && editRequestedAnnualDays > editYearRemainingAnnualDays),
    [editIsAnnual, editRequestedAnnualDays, editYearRemainingAnnualDays]
  );

  useEffect(() => {
    if (!editTypeDropdownOpen) return undefined;
    const handleDocMouseDown = (event) => {
      if (!editTypeDropdownRef.current) return;
      if (editTypeDropdownRef.current.contains(event.target)) return;
      setEditTypeDropdownOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setEditTypeDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleDocMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [editTypeDropdownOpen]);

  return (
    <div className="modal-backdrop-soft" onClick={onClose}>
      <div className="modal-card service-edit-compact" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} disabled={saving} aria-label="Fermer">
          ×
        </button>
        <div className="service-edit-header">
          <span className="service-edit-icon" aria-hidden="true" />
          <div className="service-edit-title">Modifier Demande de Congé</div>
        </div>

        <div className="service-edit-body">
          {editError ? <div className="alert alert-danger py-2 mb-3">{editError}</div> : null}

          <form className="conges-form" onSubmit={onSubmit} noValidate>
            <div className="mb-3">
              <label className="form-label">Type de congé *</label>
              <div className="emplois-select" ref={editTypeDropdownRef}>
                <button
                  type="button"
                  className={`form-select emplois-select-trigger ${
                    editTypeDropdownOpen ? "open" : ""
                  }`}
                  onClick={() => {
                    if (typesLoading || !Array.isArray(types) || !types.length) return;
                    setEditTypeDropdownOpen((prev) => {
                      const next = !prev;
                      if (next) onRequestCloseCreateTypeDropdown?.();
                      return next;
                    });
                  }}
                  aria-expanded={editTypeDropdownOpen}
                  disabled={typesLoading || !Array.isArray(types) || !types.length}
                >
                  <span>{editTypeSelectLabel}</span>
                  <span className="emplois-select-caret" aria-hidden="true" />
                </button>
                {editTypeDropdownOpen ? (
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
                    {types.map((t) => (//kol type ywali bouton
                      <button
                        key={t.id}
                        type="button"
                        className={`emplois-select-option ${
                          String(editForm.type_conge_id) === String(t.id) ? "active" : ""
                        }`}
                        onClick={() => {
                          setEditForm({ ...editForm, type_conge_id: String(t.id) });
                          setEditTypeDropdownOpen(false);
                        }}
                        role="option"
                        aria-selected={String(editForm.type_conge_id) === String(t.id)}
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
                  value={editForm.du}
                  onChange={(e) =>
                    setEditForm({ ...editForm, du: e.target.value, au: e.target.value })
                  }
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Date de fin *</label>
                <input
                  type="date"
                  className="form-control"
                  min={editForm.du || minLeadISO()}
                  value={editForm.au}
                  onChange={(e) => setEditForm({ ...editForm, au: e.target.value })}
                />
                {editForm.du && editForm.au ? (
                  <div className={`form-text ${editExceedsAnnualBalance ? "text-danger fw-semibold" : ""}`}>
                    {editSelectedDays} jour(s) sélectionné(s)
                    {editIsAnnual ? ` — solde restant ${editYearRemainingAnnualDays} j` : ""}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-3">
              <label className="form-label">Raison *</label>
              <textarea
                className="form-control"
                rows={2}
                placeholder="Ex: Vacances en famille"
                value={editForm.raison}
                onChange={(e) => setEditForm({ ...editForm, raison: e.target.value })}
              />
              {editFormErrors?.raison ? (
                <div className="form-text text-danger">{editFormErrors.raison}</div>
              ) : null}
            </div>

            <div className="service-edit-actions mt-3">
              <button className="btn service-edit-cancel-btn" onClick={onClose} disabled={saving}>
                Annuler
              </button>
              <button type="submit" className="btn service-edit-save-btn" disabled={saving}>
                <span className="service-edit-save-icon" aria-hidden="true" />
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}