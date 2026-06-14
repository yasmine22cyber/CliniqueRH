import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";

export default function HomePage() {
  const navigate = useNavigate();

  const user = useMemo(() => {
    try {
      const raw = localStorage.getItem("authUser");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const displayName = user?.prenom || user?.nom || user?.matricule || "utilisateur";
  const isAdmin = typeof user?.role === "string" && user.role.toLowerCase().includes("admin");

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("authUser");
    navigate("/", { replace: true });
  };

  return (
    <div className="container py-5">
      <div className="card shadow-sm mx-auto" style={{ maxWidth: "640px" }}>
        <div className="card-body p-4">
          <h1 className="h3 mb-3">Bonjour {displayName}</h1>
          <p className="text-muted mb-4">
            Authentification reussie. Cette page confirme que la connexion est valide.
          </p>

          <ul className="list-group mb-4">
            <li className="list-group-item">
              <strong>Matricule:</strong> {user?.matricule || "-"}
            </li>
            <li className="list-group-item">
              <strong>Role:</strong> {user?.role || "-"}
            </li>
            <li className="list-group-item">
              <strong>Email:</strong> {user?.email || "-"}
            </li>
          </ul>

          <button className="btn btn-outline-danger" onClick={handleLogout}>
            Se deconnecter
          </button>

          {isAdmin && (
            <Link to="/admin/personnel" className="btn btn-primary ms-2">
              Ouvrir l'espace Admin
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
