import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "../App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const CliniqueLogo = () => (
  <svg width="84" height="84" viewBox="0 0 64 64" aria-hidden="true">
    {/* Left heart */}
    <path d="M32 50 L12 30 A10 10 0 0 1 32 18 Z" fill="#2FA6B6" />
    {/* Right heart */}
    <path d="M32 50 L52 30 A10 10 0 0 0 32 18 Z" fill="#414373" />
    {/* Medical cross */}
    <rect x="28" y="24" width="8" height="20" fill="white" />
    <rect x="22" y="30" width="20" height="8" fill="white" />
  </svg>
);

const EyeIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    fill="currentColor"
    viewBox="0 0 16 16"
  >
    <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z" />
    <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z" />
  </svg>
);

const EyeSlashIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    fill="currentColor"
    viewBox="0 0 16 16"
  >
    <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z" />
    <path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z" />
    <path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z" />
  </svg>
);

export default function LoginPage() {
  const navigate = useNavigate();
  const [matricule, setMatricule] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");

  const validate = () => {
    const errs = {};
    const normalizedMatricule = matricule.trim();

    if (!normalizedMatricule) {
      errs.matricule = "Le matricule est requis.";
    } else if (!/^\d{10}$/.test(normalizedMatricule)) {
      errs.matricule = "Le matricule doit contenir exactement 10 chiffres.";
    }

    if (!password) {
      errs.password = "Le mot de passe est requis.";
    }

    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      setServerError("");
      return;
    }

    setErrors({});
    setLoading(true);
    setServerError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          matricule: matricule.trim(),
          password,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setServerError(payload.message || "Connexion impossible.");
        setTimeout(() => setServerError(""), 4000);
        return;
      }

      if (payload.token) {
        localStorage.setItem("authToken", payload.token);
      }

      if (payload.user) {
        localStorage.setItem("authUser", JSON.stringify(payload.user));
      }

      const role = (payload.user?.role || "").toLowerCase();
      if (role.includes("admin")) {
        navigate("/admin/dashboard", { replace: true });
      } else {
        navigate("/personnel/dashboard", { replace: true });
      }
    } catch {
      setServerError(
        "Serveur indisponible. Verifiez que le backend est lance.",
      );
      setTimeout(() => setServerError(""), 4000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-panel">
        <section className="login-visual" aria-label="Identité Clinique RH">
          <div className="login-logo-wrap">
            <CliniqueLogo />
          </div>
          <div className="login-visual-text">
            <p className="login-visual-tag">Clinique RH</p>
            <h2 className="login-visual-title">
              Bienvenue sur la plateforme RH
            </h2>
          </div>
        </section>

        <section
          className="login-form-side"
          aria-label="Formulaire de connexion"
        >
          <div className="login-form-header">
            <p className="login-eyebrow">BIENVENUE !</p>
            <p className="login-subtitle">Connectez-vous pour continuer</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="login-form">
            <div className="mb-3">
              <label className="form-label rh-label">Matricule</label>
              <input
                type="text"
                className={`form-control rh-input login-input ${errors.matricule ? "is-invalid" : ""}`}
                value={matricule}
                onChange={(e) =>
                  setMatricule(e.target.value.replace(/\D/g, ""))
                }
                placeholder="Ex: 0012345678"
                inputMode="numeric"
                maxLength={10}
                disabled={loading}
              />
              {errors.matricule && (
                <div className="invalid-feedback">{errors.matricule}</div>
              )}
            </div>

            <div className="mb-3">
              <label className="form-label rh-label">Mot de passe</label>
              <div className="input-group">
                <input
                  type={showPassword ? "text" : "password"}
                  className={`form-control rh-input login-input ${errors.password ? "is-invalid" : ""}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="input-group-text login-eye"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  aria-label={
                    showPassword
                      ? "Masquer le mot de passe"
                      : "Afficher le mot de passe"
                  }
                >
                  {showPassword ? <EyeIcon /> : <EyeSlashIcon />}
                </button>
              </div>
              {errors.password && (
                <div className="invalid-feedback d-block">
                  {errors.password}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary w-100 rh-btn login-btn"
              disabled={loading}
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>

            {serverError && (
              <div className="alert alert-danger mt-3 mb-0">{serverError}</div>
            )}
          </form>

          <div className="text-center mt-2">
            <Link to="/request-reset" className="rh-forgot login-forgot">
              Mot de passe oublié ?
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}