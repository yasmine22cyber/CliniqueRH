import { useEffect, useMemo, useRef, useState } from "react";

export default function PlanningCreateModal(props) {
  if (!props.open) return null;
  return <PlanningCreateModalInner {...props} />;
}

function PlanningCreateModalInner({
  onClose,
  onSubmit,
  error,
  form,
  handleChange,
  minCreateDateIso,
  personnelChoices,
  isServiceLocked,
  serviceOptions,
  typeOptions,
  isNightRestricted,
  hasFixedTime,
  isChefServiceSelected,
  isDayShiftForChefReplacement,
  inverseShiftLabel,
  replacementCandidates,
}) {
  const [personnelDropdownOpen, setPersonnelDropdownOpen] = useState(false);
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [replacementDropdownOpen, setReplacementDropdownOpen] = useState(false);

  const personnelDropdownRef = useRef(null);
  const serviceDropdownRef = useRef(null);
  const typeDropdownRef = useRef(null);
  const replacementDropdownRef = useRef(null);

  const selectedPersonnelLabel = useMemo(() => {
    const matricule = String(form?.matricule || "");
    if (!matricule) return "--";
    const found = (personnelChoices || []).find((p) => String(p?.matricule) === matricule);
    return found?.name || matricule || "--";
  }, [form?.matricule, personnelChoices]);

  const selectedServiceLabel = useMemo(() => {
    const key = String(form?.service || "");
    if (!key) return "--";
    const found = (serviceOptions || []).find((s) => String(s?.id ?? s?.name) === key);
    return found?.name || key || "--";
  }, [form?.service, serviceOptions]);

  const selectedReplacementLabel = useMemo(() => {
    const key = String(form?.replacementMatricule || "");
    if (!key) return "--";
    const found = (replacementCandidates || []).find((p) => String(p?.matricule) === key);
    return found?.name || key || "--";
  }, [form?.replacementMatricule, replacementCandidates]);

  const closeDropdowns = () => {
    setPersonnelDropdownOpen(false);
    setServiceDropdownOpen(false);
    setTypeDropdownOpen(false);
    setReplacementDropdownOpen(false);
  };

  const handleClose = () => {
    closeDropdowns();
    onClose?.();
  };

  useEffect(() => {
    if (!personnelDropdownOpen && !serviceDropdownOpen && !typeDropdownOpen && !replacementDropdownOpen) {
      return undefined;
    }
    const handleClickOutside = (event) => {
      const insidePersonnel =
        personnelDropdownRef.current && personnelDropdownRef.current.contains(event.target);
      const insideService =
        serviceDropdownRef.current && serviceDropdownRef.current.contains(event.target);
      const insideType = typeDropdownRef.current && typeDropdownRef.current.contains(event.target);
      const insideReplacement =
        replacementDropdownRef.current && replacementDropdownRef.current.contains(event.target);
      if (insidePersonnel || insideService || insideType || insideReplacement) return;
      closeDropdowns();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeDropdowns();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [personnelDropdownOpen, serviceDropdownOpen, typeDropdownOpen, replacementDropdownOpen]);

  return (
    <div
      className="modal-backdrop-soft emplois-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div className="modal-card service-create-modal emplois-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose} aria-label="Fermer">
          {"\u00D7"}
        </button>

        <div className="service-create-header">
          <span className="service-create-icon" aria-hidden="true" />
          <div className="service-create-title">Créer Emploi Du Temps</div>
        </div>

        <form className="emplois-modal-body emplois-modal-body--no-scroll" onSubmit={onSubmit}>
          {error ? (
            <div className="emplois-empty-banner emplois-empty-banner--compact" role="alert">
              <span className="emplois-empty-icon" aria-hidden="true">
                !
              </span>
              <div>
                <div className="emplois-empty-title">Information</div>
                <div className="emplois-empty-text">{error}</div>
              </div>
            </div>
          ) : null}

          <div className="row g-3 emplois-form-grid">
            <div className="col-md-6">
              <label className="form-label">Personnel</label>
              <div className="emplois-select" ref={personnelDropdownRef}>
                <button
                  type="button"
                  className={`form-select emplois-select-trigger ${personnelDropdownOpen ? "open" : ""}`}
                  onClick={() =>
                    setPersonnelDropdownOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        setServiceDropdownOpen(false);
                        setTypeDropdownOpen(false);
                        setReplacementDropdownOpen(false);
                      }
                      return next;
                    })
                  }
                  aria-expanded={personnelDropdownOpen}
                >
                  <span>{selectedPersonnelLabel}</span>
                  <span className="emplois-select-caret" aria-hidden="true" />
                </button>
                {personnelDropdownOpen ? (
                  <div className="emplois-select-menu" role="listbox">
                    {personnelChoices?.length ? null : (
                      <button
                        type="button"
                        className="emplois-select-option"
                        onClick={() => setPersonnelDropdownOpen(false)}
                      >
                        --
                      </button>
                    )}
                    {(personnelChoices || []).map((p) => (
                      <button
                        key={p.matricule}
                        type="button"
                        className={`emplois-select-option ${p.matricule === form?.matricule ? "active" : ""}`}
                        onClick={() => {
                          handleChange("matricule", p.matricule);
                          setPersonnelDropdownOpen(false);
                        }}
                        role="option"
                        aria-selected={p.matricule === form?.matricule}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="col-md-6">
              <label className="form-label">Service</label>
              <div className="emplois-select" ref={serviceDropdownRef}>
                <button
                  type="button"
                  className={`form-select emplois-select-trigger ${serviceDropdownOpen ? "open" : ""}`}
                  onClick={() =>
                    setServiceDropdownOpen((prev) => {
                      if (isServiceLocked) return false;
                      const next = !prev;
                      if (next) {
                        setPersonnelDropdownOpen(false);
                        setTypeDropdownOpen(false);
                        setReplacementDropdownOpen(false);
                      }
                      return next;
                    })
                  }
                  disabled={isServiceLocked}
                  aria-expanded={serviceDropdownOpen}
                >
                  <span>{selectedServiceLabel}</span>
                  <span className="emplois-select-caret" aria-hidden="true" />
                </button>
                {serviceDropdownOpen ? (
                  <div className="emplois-select-menu" role="listbox">
                    {serviceOptions?.length ? null : (
                      <button
                        type="button"
                        className="emplois-select-option"
                        onClick={() => setServiceDropdownOpen(false)}
                      >
                        --
                      </button>
                    )}
                    {(serviceOptions || []).map((s) => (
                      <button
                        key={s.id ?? s.name}
                        type="button"
                        className={`emplois-select-option ${
                          String(s.id ?? s.name) === String(form?.service) ? "active" : ""
                        }`}
                        onClick={() => {
                          handleChange("service", String(s.id ?? s.name));
                          setServiceDropdownOpen(false);
                        }}
                        role="option"
                        aria-selected={String(s.id ?? s.name) === String(form?.service)}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="col-md-4">
              <label className="form-label">Date debut</label>
              <input
                type="date"
                className="form-control"
                value={form?.date || ""}
                onChange={(e) => handleChange("date", e.target.value)}
                min={minCreateDateIso || undefined}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label">Date fin</label>
              <input
                type="date"
                className="form-control"
                value={form?.endDate || ""}
                onChange={(e) => handleChange("endDate", e.target.value)}
                min={form?.date || minCreateDateIso || undefined}
              />
            </div>
            
            <div className="col-md-4">
              <label className="form-label">Type</label>
              <div className="emplois-select" ref={typeDropdownRef}>
                <button
                  type="button"
                  className={`form-select emplois-select-trigger ${typeDropdownOpen ? "open" : ""}`}
                  onClick={() =>
                    setTypeDropdownOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        setPersonnelDropdownOpen(false);
                        setServiceDropdownOpen(false);
                        setReplacementDropdownOpen(false);
                      }
                      return next;
                    })
                  }
                  aria-expanded={typeDropdownOpen}
                >
                  <span>{form?.type || "--"}</span>
                  <span className="emplois-select-caret" aria-hidden="true" />
                </button>
                {typeDropdownOpen ? (
                  <div className="emplois-select-menu" role="listbox">
                    {(typeOptions || []).map((opt) => {
                      const isDisabled = isNightRestricted && opt === "Garde";
                      return (
                        <button
                          key={opt}
                          type="button"
                          className={`emplois-select-option ${opt === form?.type ? "active" : ""}${
                            isDisabled ? " disabled" : ""
                          }`}
                          onClick={() => {
                            if (isDisabled) return;
                            handleChange("type", opt);
                            setTypeDropdownOpen(false);
                          }}
                          role="option"
                          aria-selected={opt === form?.type}
                          disabled={isDisabled}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="col-md-4">
              <label className="form-label">Heure debut</label>
              <input
                type="time"
                className="form-control"
                value={form?.startTime || ""}
                onChange={(e) => handleChange("startTime", e.target.value)}
                disabled={hasFixedTime}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label">Heure fin</label>
              <input
                type="time"
                className="form-control"
                value={form?.endTime || ""}
                onChange={(e) => handleChange("endTime", e.target.value)}
                disabled={hasFixedTime}
              />
            </div>

            {isChefServiceSelected && isDayShiftForChefReplacement ? (
              <>
                <div className="col-md-6">
                  <div className="emplois-replace-box">
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="replace-chef-service"
                        checked={Boolean(form?.replaceChefService)}
                        onChange={(e) => handleChange("replaceChefService", e.target.checked)}
                      />
                      <label className="form-check-label" htmlFor="replace-chef-service">
                        Activer remplacement par un Surveillant
                      </label>
                    </div>
                    <div className="small text-muted mt-1">
                      Shift inverse auto: si Chef = {form?.type}, Surveillant = {inverseShiftLabel}.
                    </div>
                  </div>
                </div>

                {form?.replaceChefService ? (
                  <div className="col-md-6 senior-replacement-field">
                    <label className="form-label">Surveillant remplaçant</label>
                    <div className="emplois-select senior-replacement-dropdown" ref={replacementDropdownRef}>
                      <button
                        type="button"
                        className={`form-select emplois-select-trigger senior-replacement-trigger ${
                          replacementDropdownOpen ? "open" : ""
                        }`}
                        onClick={() =>
                          setReplacementDropdownOpen((prev) => {
                            const next = !prev;
                            if (next) {
                              setPersonnelDropdownOpen(false);
                              setServiceDropdownOpen(false);
                              setTypeDropdownOpen(false);
                            }
                            return next;
                          })
                        }
                        disabled={!replacementCandidates?.length}
                        aria-expanded={replacementDropdownOpen}
                      >
                        <span>{selectedReplacementLabel}</span>
                        <span className="emplois-select-caret" aria-hidden="true" />
                      </button>
                      {replacementDropdownOpen ? (
                        <div
                          className="emplois-select-menu senior-replacement-menu"
                          role="listbox"
                          aria-label="Choisir un Surveillant"
                        >
                          {(replacementCandidates || []).map((person) => (
                            <button
                              key={person.matricule}
                              type="button"
                              className={`emplois-select-option ${
                                String(person.matricule) === String(form?.replacementMatricule) ? "active" : ""
                              }`}
                              onClick={() => {
                                handleChange("replacementMatricule", person.matricule);
                                setReplacementDropdownOpen(false);
                              }}
                              role="option"
                              aria-selected={String(person.matricule) === String(form?.replacementMatricule)}
                            >
                              {person.name || person.matricule}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {!replacementCandidates?.length ? (
                      <div className="small text-danger mt-1">
                        Aucun Surveillant disponible dans le meme service.
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="col-md-12">
              <label className="form-label">Note</label>
              <textarea
                className="form-control emplois-notes-input"
                value={form?.notes || ""}
                onChange={(e) => handleChange("notes", e.target.value)}
                rows={2}
                placeholder="Ajouter une note (optionnel)..."
              />
            </div>
          </div>

          <div className="emplois-modal-actions mt-4">
            <button className="btn emplois-btn-secondary" type="button" onClick={handleClose}>
              Annuler
            </button>
            <button className="btn emplois-btn-primary" type="submit">
              + Créer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}