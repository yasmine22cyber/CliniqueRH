import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "../App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export default function RequestReset() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const emailFromUrl = (searchParams.get("email") || "").trim().toLowerCase();
  const [email, setEmail] = useState(emailFromUrl);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");

  const validate = (value) => {
    const errs = {};
    if (!value) {
      errs.email = "L'email est requis.";
    } else if (!/\S+@\S+\.\S+/.test(value)) {
      errs.email = "Format d'email invalide.";
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const errs = validate(normalizedEmail);

    if (Object.keys(errs).length) {
      setErrors(errs);
      setServerError("");
      return;
    }

    setErrors({});
    setServerError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/request-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setServerError(payload.message || "Email introuvable."); setTimeout(() => setServerError(""), 4000);
        return;
      }

      navigate("/reset-confirmation", {
        state: { email: normalizedEmail },
      });
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
          <h1 className="rh-title">Reinitialisation du mot de passe</h1>

          <p className="text-center text-muted mb-4">
            Entrez votre email pour recevoir un lien de reinitialisation
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-3">
              <label className="form-label rh-label">Email</label>
              <input
                type="email"
                className={`form-control rh-input ${errors.email ? "is-invalid" : ""}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="exemple@clinique.com"
                disabled={loading}
              />
              {errors.email && <div className="invalid-feedback">{errors.email}</div>}
            </div>

            <button type="submit" className="btn btn-primary w-100 rh-btn" disabled={loading}>
              {loading ? "Envoi..." : "Envoyer le lien"}
            </button>
            {serverError && <div className="alert alert-danger mt-3 mb-0">{serverError}</div>}
          </form>

          <div className="text-center mt-3">
            <Link to="/" className="rh-forgot">
              Retour a la connexion
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}