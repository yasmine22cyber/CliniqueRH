import { useEffect, useMemo, useState } from "react";


const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
    <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z" />
    <path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z" />
    <path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z" />
  </svg>
);

const EyeOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
    <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z" />
    <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z" />
  </svg>
);

const LockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
  </svg>
);

const normalizeDigits = (value = "", max = 8) =>
  (String(value || "").match(/\d/g) || []).join("").slice(0, max);

export default function PersonnelProfileEditModal({
  open,
  onClose,
  onSubmit,
  saving,
  error,
  profile,
}) {
  const [form, setForm] = useState({
    email: "",
    phone: "",
    adresse: "",
    oldPassword: "",
    password: "",
    confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setForm({
        email: String(profile?.email || "").trim(),
        phone: normalizeDigits(profile?.num_telephone || profile?.phone || "", 8),
        adresse: String(profile?.adresse || "").trim(),
        oldPassword: "",
        password: "",
        confirmPassword: "",
      });
      setFieldErrors({});
    }, 0);
    return () => clearTimeout(timer);
  }, [open, profile]);

  const fullName = useMemo(
    () => [profile?.prenom, profile?.nom].filter(Boolean).join(" ").trim() || "--",
    [profile],
  );

  if (!open) return null;

  const handleClose = () => {
    if (saving) return;
    onClose?.();
  };

  const isOldPasswordError = typeof error === 'string' && error.toLowerCase().includes("ancien mot de passe");

  const handleSubmit = (event) => {
    event.preventDefault();

    const nextErrors = {};
    if (!/\S+@\S+\.\S+/.test(form.email)) {
      nextErrors.email = "Email invalide.";
    }
    if (!/^\d{8}$/.test(form.phone)) {
      nextErrors.phone = "Telephone: 8 chiffres.";
    }
    if (!String(form.adresse || "").trim()) {
      nextErrors.adresse = "Adresse requise.";
    }
    if (form.password || form.oldPassword) {
      if (!form.oldPassword) {
        nextErrors.oldPassword = "Requis.";
      }
      if (form.password && !/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(form.password)) {
        nextErrors.password = "8+ caracteres avec majuscule, chiffre et symbole.";
      }
      if (form.password !== form.confirmPassword) {
        nextErrors.confirmPassword = "Confirmation du mot de passe invalide.";
      }
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    onSubmit?.({
      email: form.email.trim(),
      phone: form.phone,
      adresse: form.adresse.trim(),
      oldPassword: form.oldPassword || undefined,
      password: form.password || undefined,
    });
  };

  return (
    <div className="modal-backdrop-soft" role="dialog" aria-modal="true" onClick={handleClose}>
      <div
        className="modal-card service-edit-compact personnel-profile-edit-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          onClick={handleClose}
          disabled={saving}
          aria-label="Fermer"
        >
          {"\u00D7"}
        </button>

        <div className="service-edit-header">
          <span className="service-edit-icon" aria-hidden="true" />
          <div className="service-edit-title">Modifier les informations personnelles</div>
        </div>

        <form
          className="service-edit-body modal-body-scroll personnel-profile-edit-form"
          onSubmit={handleSubmit}
          noValidate
        >
          {error && !isOldPasswordError ? <div className="alert alert-danger py-2 mb-2">{error}</div> : null}

          <div className="personnel-profile-edit-section">
            <div className="personnel-profile-edit-section-title">Informations personnelles</div>

            <div className="personnel-profile-edit-grid">
              <div>
                <label className="form-label">Nom Prenom</label>
                <input className="form-control" value={fullName} disabled />
              </div>
              <div>
                <label className="form-label">CIN</label>
                <input className="form-control" value={profile?.cin || "--"} disabled />
              </div>
              <div>
                <label className="form-label">Telephone</label>
                <input
                  type="tel"
                  className={`form-control${fieldErrors.phone ? " is-invalid" : ""}`}
                  inputMode="numeric"
                  maxLength={8}
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: normalizeDigits(event.target.value, 8) }))}
                />
                {fieldErrors.phone ? <div className="text-danger small mt-1">{fieldErrors.phone}</div> : null}
              </div>
              <div>
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className={`form-control${fieldErrors.email ? " is-invalid" : ""}`}
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                />
                {fieldErrors.email ? <div className="text-danger small mt-1">{fieldErrors.email}</div> : null}
              </div>
              <div className="personnel-profile-edit-grid-span">
                <label className="form-label">Adresse</label>
                <input
                  type="text"
                  className={`form-control${fieldErrors.adresse ? " is-invalid" : ""}`}
                  value={form.adresse}
                  onChange={(event) => setForm((prev) => ({ ...prev, adresse: event.target.value }))}
                />
                {fieldErrors.adresse ? <div className="text-danger small mt-1">{fieldErrors.adresse}</div> : null}
              </div>
            </div>
          </div>

          <div className="personnel-profile-edit-section">
            <div className="personnel-profile-edit-section-title">Modifier le Mot de Passe</div>

            <div className="personnel-profile-edit-grid single">
              <div>
                <label className="form-label">Ancien Mot de Passe</label>
                <div className="personnel-password-field">
                  <div className="personnel-password-icon" aria-hidden="true">
                    <LockIcon />
                  </div>
                  <input
                    type={showOldPassword ? "text" : "password"}
                    className={`form-control personnel-password-input${fieldErrors.oldPassword ? " is-invalid" : ""}`}
                    value={form.oldPassword}
                    onChange={(event) => setForm((prev) => ({ ...prev, oldPassword: event.target.value }))}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    className="personnel-password-toggle"
                    title={showOldPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    aria-label={showOldPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showOldPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {fieldErrors.oldPassword ? (
                  <div className="text-danger small mt-1">{fieldErrors.oldPassword}</div>
                ) : isOldPasswordError ? (
                  <div className="text-danger small mt-1">{error}</div>
                ) : null}
              </div>

              <div>
                <label className="form-label">Nouveau Mot de Passe</label>
                <div className="personnel-password-field">
                  <div className="personnel-password-icon" aria-hidden="true">
                    <LockIcon />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    className={`form-control personnel-password-input${fieldErrors.password ? " is-invalid" : ""}`}
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="personnel-password-toggle"
                    title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {fieldErrors.password ? <div className="text-danger small mt-1">{fieldErrors.password}</div> : null}
              </div>

              <div>
                <label className="form-label">Confirmer le Nouveau Mot de Passe</label>
                <div className="personnel-password-field">
                  <div className="personnel-password-icon" aria-hidden="true">
                    <LockIcon />
                  </div>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    className={`form-control personnel-password-input${fieldErrors.confirmPassword ? " is-invalid" : ""}`}
                    value={form.confirmPassword}
                    onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="personnel-password-toggle"
                    title={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {fieldErrors.confirmPassword ? (
                  <div className="text-danger small mt-1">{fieldErrors.confirmPassword}</div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="service-edit-actions personnel-profile-edit-actions">
            <button className="btn service-edit-cancel-btn" onClick={handleClose} disabled={saving}>
              Annuler
            </button>
            <button type="submit" className="btn service-edit-save-btn" disabled={saving}>
              {saving ? "Sauvegarder..." : "Sauvegarder"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}