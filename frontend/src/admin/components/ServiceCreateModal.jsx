export default function ServiceCreateModal({
  open,
  onClose,
  onSubmit,
  form,
  updateForm,
  formErrors,
  saving,
}) {
  if (!open) return null;

  const normalizeServiceInput = (value) => {
    const raw = `${value ?? ""}`.replace(/^\s+/, "");
    if (!raw) return "";
    return raw[0].toLocaleUpperCase("fr-FR") + raw.slice(1);
  };

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  return (
    <div className="modal-backdrop-soft" role="dialog" aria-modal="true" onClick={handleClose}>
      <div className="modal-card service-create-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose} disabled={saving} aria-label="Fermer">
          {"\u00D7"}
        </button>

        <div className="service-create-header">
          <span className="service-create-icon" aria-hidden="true" />
          <div className="service-create-title">Ajouter Service</div>
        </div>

        <form onSubmit={onSubmit} noValidate>
          <div className="service-create-body">
            <div className="mb-3">
              <label className="form-label service-create-label">Nom du service *</label>
              <input
                className={`form-control service-create-input ${formErrors?.nom ? "is-invalid" : ""}`}
                placeholder="Ex: Urgences"
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
              <label className="form-label service-create-label">Description</label>
              <textarea
                className="form-control service-create-input"
                rows={3}
                placeholder="Description du service..."
                value={form?.description || ""}
                onChange={(e) => updateForm({ description: e.target.value })}
              />
            </div>
            <div className="mb-0">
              <label className="form-label service-create-label">Numero telephone service *</label>
              <input
                type="text"
                inputMode="numeric"
                className={`form-control service-create-input ${formErrors?.numTelService ? "is-invalid" : ""}`}
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
          </div>

          <div className="service-create-actions">
            <button className="btn service-create-cancel-btn" onClick={handleClose} disabled={saving}>
              Annuler
            </button>
            <button type="submit" className="btn service-create-submit-btn" disabled={saving}>
              {saving ? "Enregistrement..." : "+ Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}