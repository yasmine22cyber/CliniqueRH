import React, { useCallback } from "react";
import LoginPage from "./pages/Loginpages";
import ResetPassword from "./pages/Forgetpassword";
import RequestReset from "./pages/RequestReset";
import ResetConfirmation from "./pages/ResetConfirmation";
import AdminLayout from "./admin/AdminLayout";
import PersonnelLayout from "./personnel/PersonnelLayout";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("authToken");
  return token ? children : <Navigate to="/" replace />;
}

function AdminRoute({ children }) {
  const token = localStorage.getItem("authToken");
  const userRaw = localStorage.getItem("authUser");
  const user = userRaw ? JSON.parse(userRaw) : null;

  if (!token) return <Navigate to="/" replace />;
  const isAdmin = typeof user?.role === "string" && user.role.toLowerCase().includes("admin");
  if (!isAdmin) return <Navigate to="/home" replace />;
  return children;
}

function PersonnelRoute({ children }) {
  const token = localStorage.getItem("authToken");
  const userRaw = localStorage.getItem("authUser");
  const user = userRaw ? JSON.parse(userRaw) : null;

  if (!token) return <Navigate to="/" replace />;

  const role = (user?.role || "").toLowerCase();
  if (role.includes("admin")) return <Navigate to="/admin/dashboard" replace />;

  return children;
}

const RoleRedirect = () => {
  const userRaw = localStorage.getItem("authUser");
  const user = userRaw ? JSON.parse(userRaw) : null;
  const role = (user?.role || "").toLowerCase();
  if (role.includes("admin")) return <Navigate to="/admin/dashboard" replace />;
  return <Navigate to="/personnel/dashboard" replace />;
};

function App() {
  const navigate = useNavigate();

  const handleLogout = useCallback(() => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("authUser");
    navigate("/", { replace: true });
  }, [navigate]);

  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <RoleRedirect />
          </ProtectedRoute>
        }
      />
      <Route path="/forgot-password" element={<ResetPassword />} />
      <Route path="/request-reset" element={<RequestReset />} />
      <Route path="/reset-confirmation" element={<ResetConfirmation />} />
      <Route
        path="/admin/dashboard"
        element={
          <AdminRoute>
            <AdminLayout onLogout={handleLogout} />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/personnel"
        element={
          <AdminRoute>
            <AdminLayout initialTab="personnel" onLogout={handleLogout} />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/services"
        element={
          <AdminRoute>
            <AdminLayout initialTab="services" onLogout={handleLogout} />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/plannings"
        element={
          <AdminRoute>
            <AdminLayout initialTab="emplois" onLogout={handleLogout} />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/conges"
        element={
          <AdminRoute>
            <AdminLayout initialTab="conges" onLogout={handleLogout} />
          </AdminRoute>
        }
      />
      <Route
        path="/personnel/dashboard"
        element={
          <PersonnelRoute>
            <PersonnelLayout initialTab="dashboard" onLogout={handleLogout} />
          </PersonnelRoute>
        }
      />
      <Route
        path="/personnel/planning"
        element={
          <PersonnelRoute>
            <PersonnelLayout initialTab="planning" onLogout={handleLogout} />
          </PersonnelRoute>
        }
      />
      <Route
        path="/personnel/conges"
        element={
          <PersonnelRoute>
            <PersonnelLayout initialTab="conges" onLogout={handleLogout} />
          </PersonnelRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;