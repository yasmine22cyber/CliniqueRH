export default function BISlicer({
  title,
  options = [],
  value = "all",
  className = "",
  onChange,
  onReset,
  showReset = true,
  resetLabel = "Tous",
  resetDisabled = false,
  emptyLabel = "Aucune option",
  ariaLabel = "Filtre",
}) {
  const safeOptions = Array.isArray(options) ? options : [];

  return (
    <div className={`admin-bi-slicer ${className}`.trim()}>
      <div className="admin-bi-slicer-head">
        <span>{title}</span>
        {showReset ? (
          <button
            type="button"
            className="admin-bi-slicer-reset"
            onClick={onReset}
            disabled={resetDisabled}
          >
            {resetLabel}
          </button>
        ) : null}
      </div>

      <div className="admin-bi-slicer-list" role="listbox" aria-label={ariaLabel}>
        {safeOptions.length ? (
          safeOptions.map((opt) => {
            const key = String(opt?.id ?? "");
            const active = key === String(value);
            return (
              <button
                key={key}
                type="button"
                className={`admin-bi-slicer-item ${active ? "active" : ""}`}
                onClick={() => onChange?.(opt?.id)}
                role="option"
                aria-selected={active}
              >
                {opt?.label || "--"}
              </button>
            );
          })
        ) : (
          <div className="admin-bi-slicer-empty">{emptyLabel}</div>
        )}
      </div>
    </div>
  );
}
