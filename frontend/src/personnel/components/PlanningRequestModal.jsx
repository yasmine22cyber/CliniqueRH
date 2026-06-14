import { useEffect, useRef, useState } from "react";

export default function PlanningRequestModal(props) {
  if (!props.open) return null;
  return <PlanningRequestModalInner {...props} />;
}

function PlanningRequestModalInner({
  onClose,
  requestEditId,
  requestFieldErrors,
  requestError,
  submitRequest,
  requestForm,
  setRequestForm,
  minRequestDateIso,
  shiftOptionsForDate,
  requestShiftOptions,
  setRequestFieldErrors,
  setRequestError,
  requestSaving,
}) {
  const [shiftDropdownOpen, setShiftDropdownOpen] = useState(false);
  const shiftDropdownRef = useRef(null);

  const handleClose = () => {
    if (requestSaving) return;
    setShiftDropdownOpen(false);
    onClose?.();
  };

  useEffect(() => {
    if (!shiftDropdownOpen) return undefined;
    const handleDocMouseDown = (event) => {
      if (!shiftDropdownRef.current) return;
      if (shiftDropdownRef.current.contains(event.target)) return;
      setShiftDropdownOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setShiftDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleDocMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [shiftDropdownOpen]);

  return (
    <div className="modal-backdrop-soft" role="dialog" aria-modal="true" onClick={handleClose}>
      <div
        className="modal-card service-edit-compact planning-request-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          onClick={handleClose}
          disabled={requestSaving}
          aria-label="Fermer"
        >
          {"\u00D7"}
        </button>
        <div className="service-edit-header">
          <span className="service-edit-icon" aria-hidden="true" />
          <div className="service-edit-title">
            {requestEditId ? "Modification de demande" : "Demande de modification"}
          </div>
        </div>
        {Object.values(requestFieldErrors).some(Boolean) ? (
          <div className="conges-history-flash tone-refused" role="alert">
            {Object.values(requestFieldErrors)
              .filter(Boolean)
              .map((msg) => (
                <div key={msg}>{msg}</div>
              ))}
          </div>
        ) : null}
        {requestError ? <div className="alert alert-danger py-2 mb-3">{requestError}</div> : null}
        <form onSubmit={submitRequest} className="planning-request-form" noValidate>
          <div className="planning-request-form-grid">
            <div>
              <label className="form-label">Nouvelle date preferee *</label>
              <input
                type="date"
                className={`form-control${requestFieldErrors.date_preferee ? " is-invalid" : ""}`}
                min={minRequestDateIso()}
                value={requestForm.date_preferee}
                onChange={(e) => {
                  const next = e.target.value;
                  const options = shiftOptionsForDate(next);
                  setRequestForm((prev) => ({
                    ...prev,
                    date_preferee: next,
                    shift_type: options.includes(prev.shift_type)
                      ? prev.shift_type
                      : options[0] || prev.shift_type,
                  }));
                  setShiftDropdownOpen(false);
                  if (requestFieldErrors.date_preferee) {
                    setRequestFieldErrors((prev) => ({
                      ...prev,
                      date_preferee: "",
                    }));
                  }  
                  if (requestFieldErrors.shift_type) {
                    setRequestFieldErrors((prev) => ({
                      ...prev,
                      shift_type: "",
                    }));
                  }
                  if (requestError) setRequestError("");
                }}
                required
              />
            </div>
            <div>
              <label className="form-label">Shift prefere *</label>
              <div className="emplois-select planning-request-shift-select" ref={shiftDropdownRef}>
                <button
                  type="button"
                  className={`form-select emplois-select-trigger ${
                    shiftDropdownOpen ? "open" : ""
                  }${requestFieldErrors.shift_type ? " is-invalid" : ""}`}
                  onClick={() => {
                    if (!requestShiftOptions.length) return;
                    setShiftDropdownOpen((prev) => !prev);
                  }}
                  aria-expanded={shiftDropdownOpen}
                  disabled={!requestShiftOptions.length}
                >
                  <span>{requestForm.shift_type || "--"}</span>
                  <span className="emplois-select-caret" aria-hidden="true" />
                </button>
                {shiftDropdownOpen ? (
                  <div className="emplois-select-menu" role="listbox">
                    {requestShiftOptions.length ? (
                      requestShiftOptions.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className={`emplois-select-option ${
                            requestForm.shift_type === opt ? "active" : ""
                          }`}
                          onClick={() => {
                            setRequestForm((prev) => ({
                              ...prev,
                              shift_type: opt,
                            }));
                            setShiftDropdownOpen(false);
                            if (requestFieldErrors.shift_type) {
                              setRequestFieldErrors((prev) => ({
                                ...prev,
                                shift_type: "",
                              }));
                            }
                            if (requestError) setRequestError("");
                          }}
                          role="option"
                          aria-selected={requestForm.shift_type === opt}
                        >
                          {opt}
                        </button>
                      ))
                    ) : (
                      <button className="emplois-select-option disabled" disabled>
                        Aucun shift disponible
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            <div>
              <label className="form-label">Raison *</label>
              <textarea
                className={`form-control${requestFieldErrors.raison ? " is-invalid" : ""}`}
                rows={3}
                value={requestForm.raison}
                onChange={(e) => {
                  const next = e.target.value;
                  setRequestForm((prev) => ({
                    ...prev,
                    raison: next,
                  }));
                  if (requestFieldErrors.raison) {
                    setRequestFieldErrors((prev) => ({
                      ...prev,
                      raison: "",
                    }));
                  }
                  if (requestError) setRequestError("");
                }}
                placeholder="Expliquez la demande de modification..."
                required
              />
            </div>
          </div>
            <div className="modal-actions">
            <button
              type="button"
              className="btn emplois-btn-secondary"
              onClick={handleClose}
              disabled={requestSaving}
            >
              Annuler
            </button>
            <button
              type="submit"
              className={`btn planning-request-submit ${
                requestEditId ? "service-edit-save-btn" : "admin-accent-btn"
              }`}
              disabled={requestSaving}
            >
              {requestSaving ? (
                "Envoi..."
              ) : requestEditId ? (
                <>
                  <span className="planning-request-submit-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <rect
                        x="4"
                        y="6"
                        width="16"
                        height="12"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <path
                        d="M8 10h8"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  Sauvegarder
                </>
              ) : (
                "Envoyer la demande"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}