export default function PersonnelDeleteModal({
  open,
  target,
  onClose,
  onConfirm,
  saving,
}) {
  if (!open || !target) return null;

  const fullName = [target.prenom, target.nom].filter(Boolean).join(" ");
  const displayDate = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("fr-FR");
    const str = String(value);
    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(str)) return str;
    if (str.includes("T")) return str.split("T")[0];
    return str.slice(0, 10);
  };

  return (
    <div className="modal-backdrop-soft" onClick={onClose}>
      <div className="modal-card personnel-delete-modal" onClick={(e) => e.stopPropagation()}>
        <div className="personnel-delete-header">
          <span className="personnel-delete-icon">!</span>
          <span className="personnel-delete-title">Supprimer Personnel</span>
          <button
            type="button"
            className="personnel-delete-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
        <div className="personnel-delete-body">Êtes-vous sûr de vouloir supprimer ce personnel suivant ?</div>
        <div className="personnel-delete-summary">
          <div className="fw-semibold">{fullName}</div>
          <div className="small text-muted">
            {target.grade || "—"} · {target.service || "—"}
          </div>
          <div className="small text-muted">
            CIN: {target.cin || "—"} · Embauche: {displayDate(target.date_embauche)}
          </div>
        </div>
        <div className="personnel-delete-actions">
          <button className="btn service-delete-cancel-btn" onClick={onClose} disabled={saving}>
            Annuler
          </button>
          <button className="btn services-delete-confirm-btn" onClick={onConfirm} disabled={saving}>
            {saving ? "Suppression..." : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}