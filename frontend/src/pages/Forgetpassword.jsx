import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "../App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
    <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z" />
    <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z" />
  </svg>
);

const EyeSlashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
    <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z" />
    <path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z" />
    <path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z" />
  </svg>
);

const LockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M7 11V8a5 5 0 0 1 10 0v3" />
    <path d="M12 15v2" />
  </svg>
);

export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const emailFromUrl = (params.get("email") || "").trim().toLowerCase();
  const token = params.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    if (!emailFromUrl || !token) {
      setServerError("Lien invalide. Redemandez un email de reinitialisation."); setTimeout(() => setServerError(""), 4000);
    }
  }, [emailFromUrl, token]);

  const validate = () => {
    const errs = {};

    if (!newPassword) {
      errs.newPassword = "Le nouveau mot de passe est requis.";
    } else if (!STRONG_PASSWORD_REGEX.test(newPassword)) {
      errs.newPassword =
        "Le mot de passe doit avoir au moins 8 caracteres avec majuscule, minuscule, chiffre et symbole.";
    }

    if (!confirmPassword) {
      errs.confirmPassword = "Veuillez confirmer le mot de passe.";
    } else if (confirmPassword !== newPassword) {
      errs.confirmPassword = "Les mots de passe ne correspondent pas.";
    }

    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    setErrors({});
    setServerError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailFromUrl,
          token,
          newPassword,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setServerError(payload.message || "Lien invalide ou expire."); setTimeout(() => setServerError(""), 4000);
        return;
      }

      alert("Mot de passe modifie avec succes. Connectez-vous avec le nouveau mot de passe.");
      navigate("/");
    } catch {
      setServerError("Serveur indisponible. Reessayez."); setTimeout(() => setServerError(""), 4000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rh-page">
      <div className="card rh-card shadow-lg">
        <div className="card-body p-4">
          <h1 className="rh-title">Reinitialiser le mot de passe</h1>
          {emailFromUrl && <p className="text-center text-muted small mb-3">Email: {emailFromUrl}</p>}

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-3">
              <label className="form-label rh-label">Nouveau mot de passe</label>
              <div className="input-group">
                <span className="input-group-text login-input-icon" aria-hidden="true">
                  <LockIcon />
                </span>
                <input
                  type={showNewPassword ? "text" : "password"}
                  className={`form-control rh-input login-input ${errors.newPassword ? "is-invalid" : ""}`}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="********"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="input-group-text login-eye"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  disabled={loading}
                >
                  {showNewPassword ? <EyeIcon /> : <EyeSlashIcon />}
                </button>
              </div>
              {errors.newPassword && <div className="invalid-feedback d-block">{errors.newPassword}</div>}
            </div>

            <div className="mb-3">
              <label className="form-label rh-label">Confirmer le mot de passe</label>
              <div className="input-group">
                <span className="input-group-text login-input-icon" aria-hidden="true">
                  <LockIcon />
                </span>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  className={`form-control rh-input login-input ${errors.confirmPassword ? "is-invalid" : ""}`}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="********"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="input-group-text login-eye"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={loading}
                >
                  {showConfirmPassword ? <EyeIcon /> : <EyeSlashIcon />}
                </button>
              </div>
              {errors.confirmPassword && <div className="invalid-feedback d-block">{errors.confirmPassword}</div>}
            </div>

            <button type="submit" className="btn btn-primary w-100 rh-btn" disabled={loading || !token}>
              {loading ? "Modification..." : "Modifier le mot de passe"}
            </button>
            {serverError && <div className="alert alert-danger mt-3 mb-0">{serverError}</div>}
          </form>

          <div className="text-center mt-3">
            <Link to="/" className="rh-forgot">
              Retour a la page de connexion
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}