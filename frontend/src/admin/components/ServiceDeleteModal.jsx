export default function ServiceDeleteModal({
  open,
  deleteTarget,
  onClose,
  busy,
  isDeleteBlocked,
  onConfirm,
}) {
  if (!open || !deleteTarget) return null;

  const normalizePhone = (value) => (value || "").toString().replace(/\D/g, "");
  const formatPhone = (value) => {
    const digits = normalizePhone(value);
    if (digits.length === 8) return `+216 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)}`;
    return digits || "Non renseigne";
  };

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  return (
    <div className="modal-backdrop-soft" role="dialog" aria-modal="true" onClick={handleClose}>
      <div className="modal-card personnel-delete-modal" onClick={(e) => e.stopPropagation()}>
        <div className="personnel-delete-header">
          <span className="personnel-delete-icon">!</span>
          <span className="personnel-delete-title">Supprimer Service</span>
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
          {isDeleteBlocked
            ? "Impossible de supprimer ce service car il contient du personnel. Veuillez transférer ou supprimer le personnel d'abord."
            : "Etes-vous sur de vouloir supprimer ce service ?"}
        </div>

        <div className="personnel-delete-summary">
          <div className="fw-semibold">{deleteTarget.service || "-"}</div>
          <div className="small text-muted">{deleteTarget.description || "Sans description"}</div>
          <div className="small text-muted">
            Employes: {deleteTarget.employee_count || 0} | Tel: {formatPhone(deleteTarget.num_telephone)}
          </div>
        </div>

        <div className="personnel-delete-actions">
          <button className="btn service-delete-cancel-btn" onClick={handleClose} disabled={busy}>
            Annuler
          </button>
          {!isDeleteBlocked && (
            <button className="btn services-delete-confirm-btn" onClick={onConfirm} disabled={busy}>
              {busy ? "Suppression..." : "Supprimer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}