export default function ServiceEditModal({
  open,
  currentEditService,
  onClose,
  onSubmit,
  form,
  updateForm,
  formErrors,
  saving,
}) {
  if (!open || !currentEditService) return null;

  const normalizePhone = (value) => (value || "").toString().replace(/\D/g, "");
  const formatPhoneOrEmpty = (value) => {
    const digits = normalizePhone(value);
    if (digits.length === 8) return `+216 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)}`;
    return digits;
  };

  const normalizeServiceInput = (value) => {
    const raw = `${value ?? ""}`.replace(/^\s+/, "");
    if (!raw) return "";
    return raw[0].toLocaleUpperCase("fr-FR") + raw.slice(1);
  };

  const initials = (name = "") =>
    String(name || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("");

  const chefPhone = (currentEditService?.chef_de_service || "").trim()
    ? formatPhoneOrEmpty(currentEditService?.chef_num_telephone)
    : "";

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  return (
    <div className="modal-backdrop-soft" role="dialog" aria-modal="true" onClick={handleClose}>
      <div className="modal-card service-edit-compact" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose} disabled={saving} aria-label="Fermer">
          {"\u00D7"}
        </button>

        <div className="service-edit-header">
          <span className="service-edit-icon" aria-hidden="true" />
          <div className="service-edit-title">Modifier Service</div>
        </div>

        <form onSubmit={onSubmit} noValidate>
          <div className="service-edit-body">
            <div className="mb-3">
              <label className="form-label">Nom du Service *</label>
              <input
                className={`form-control ${formErrors?.nom ? "is-invalid" : ""}`}
                required
                value={form?.nom || ""}
                onChange={(e) =>
                  updateForm({
                    nom: normalizeServiceInput(e.target.value),
                  })
                }
              />
              {formErrors?.nom ? <div className="text-danger small mt-1">{formErrors.nom}</div> : null}
            </div>

            <div className="mb-3">
              <label className="form-label">Responsable</label>
              <div className="service-edit-responsable-row">
                <div className="d-flex align-items-center gap-2">
                  <span className="service-avatar">{initials(currentEditService.chef_de_service || "C")}</span>
                  <div>
                    <div className="fw-semibold">{currentEditService.chef_de_service || "Non defini"}</div>
                    <div className="small text-muted">{chefPhone}</div>
                  </div>
                </div>
                <div className="fw-semibold text-muted">{chefPhone}</div>
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label">Numero de Telephone *</label>
              <input
                type="text"
                inputMode="numeric"
                className={`form-control ${formErrors?.numTelService ? "is-invalid" : ""}`}
                placeholder="8 chiffres"
                maxLength={8}
                required
                value={form?.numTelService || ""}
                onChange={(e) =>
                  updateForm({
                    numTelService: e.target.value.replace(/\D/g, "").slice(0, 8),
                  })
                }
              />
              {formErrors?.numTelService && <div className="text-danger small mt-1">{formErrors.numTelService}</div>}
            </div>

            <div className="mb-3">
              <label className="form-label">Description</label>
              <textarea
                className="form-control"
                rows={2}
                placeholder="Description du service..."
                value={form?.description || ""}
                onChange={(e) => updateForm({ description: e.target.value })}
              />
            </div>
          </div>

          <div className="service-edit-actions">
            <button className="btn service-edit-cancel-btn" onClick={handleClose} disabled={saving}>
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
  );
}