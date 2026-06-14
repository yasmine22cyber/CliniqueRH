import { Link, useLocation } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "../App.css";

function maskEmail(email) {
  if (!email || !email.includes("@")) {
    return "";
  }

  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return email;
  }

  if (localPart.length <= 2) {
    return `${localPart[0] || ""}*@${domain}`;
  }

  return `${localPart.slice(0, 2)}***@${domain}`;
}

export default function ResetConfirmation() {
  const { state } = useLocation();
  const email =
    typeof state?.email === "string" ? state.email.trim().toLowerCase() : "";
  const displayEmail = email ? maskEmail(email) : "votre adresse email";

  return (
    <div className="rh-page">
      <div className="card rh-card shadow-lg">
        <div className="card-body p-4 p-sm-5 text-center">
          <div className="mb-3">
            <div
              className="d-inline-flex justify-content-center align-items-center mx-auto"
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "50%",
                background:
                  "radial-gradient(circle at top, #4dc46d 0%, #2f9e4b 75%)",
                boxShadow: "0 8px 20px rgba(47, 158, 75, 0.35)",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="34"
                height="34"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M20 6L9 17l-5-5"
                  stroke="#fff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <h1 className="rh-title mb-2">Email envoye avec succes</h1>

          <p className="text-muted mb-3">
            Un lien de reinitialisation a ete envoye a{" "}
            <strong className="text-dark">{displayEmail}</strong>.
          </p>

          <div
            className="alert alert-light border text-start mb-4"
            role="status"
          >
            <p className="mb-2 fw-semibold text-dark">Prochaines etapes</p>
            <ol className="mb-0 ps-3 text-muted">
              <li>Ouvrez votre boite de reception (ou le dossier spam).</li>
              <li>Cliquez sur le lien recu.</li>
              <li>Creez un nouveau mot de passe securise.</li>
            </ol>
          </div>

          <div className="d-grid gap-2">
            <Link to="/" className="btn btn-primary rh-btn">
              Retour a la connexion
            </Link>
            <Link
              to={
                email
                  ? `/request-reset?email=${encodeURIComponent(email)}`
                  : "/request-reset"
              }
              className="rh-forgot mt-0"
            >
              Renvoyer un email
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}