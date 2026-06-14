import { useCallback, useEffect, useMemo, useState } from "react";
import AdminSidebar from "./AdminSidebar";
import DashboardPage from "./pages/Dashboard";
import PersonnelPage from "./pages/Personnel";
import ServicesPage from "./pages/Services";
import PlanningAdminPage from "./pages/PlanningAdmin";
import AdminCongesPage from "./pages/CongesAdmin";
import Chatbot from "../components/Chatbot";
import "./admin.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : "http://localhost:5000");

const normalizeStatus = (value = "") =>
  value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const asDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("fr-FR");
};

const asTimestamp = (value) => {
  const d = new Date(value);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
};

const stampKey = (value) => {
  if (value === null || typeof value === "undefined") return "";
  return typeof value === "string" ? value : String(value);
};

const normalizeShiftLabel = (value = "") => {
  const raw = value.toString().trim();
  if (!raw) return "";
  const key = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (key.includes("apres")) return "Apres-midi";
  if (key.includes("nuit") || key.includes("garde")) return "Garde";
  if (key.includes("matin")) return "Matin";
  return raw;
};
//tjib token mta3 login w t7otou fel format mte3 API request.
const getAuthHeaders = () => {
  try {
    const token = localStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  } catch {
    return undefined;
  }
};

export default function AdminLayout({ initialTab = "dashboard", onLogout }) {
  const adminIdentityKey = useMemo(() => {
    try {
      const raw = localStorage.getItem("authUser");
      const user = raw ? JSON.parse(raw) : null;
      const key = user?.matricule || user?.email || user?.id || "admin";
      return String(key);
    } catch {
      return "admin";
    }
  }, []);

  const seenStorageKey = useMemo(
    () => `admin_seen_notifications_v2_${adminIdentityKey}`,
    [adminIdentityKey]
  );

  const [active, setActive] = useState(initialTab);
  const [notifications, setNotifications] = useState([]);
  const [seenNotificationIds, setSeenNotificationIds] = useState(() => {
    try {
      const raw = localStorage.getItem(seenStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
    } catch {
      return [];
    }
  });

  const loadNotifications = useCallback(async () => {
    try {
      const [congesSettled, planningSettled] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/api/conges/admin`, { headers: getAuthHeaders() }).then(async (resp) => {
          const json = await resp.json().catch(() => []);
          if (!resp.ok) throw new Error("Conges load failed.");
          return Array.isArray(json) ? json : [];
        }),
        fetch(`${API_BASE_URL}/api/planning-requests/admin`, { headers: getAuthHeaders() }).then(async (resp) => {
          const json = await resp.json().catch(() => []);
          if (!resp.ok) throw new Error("Planning requests load failed.");
          return Array.isArray(json) ? json : [];
        }),
      ]);

      const congesData = congesSettled.status === "fulfilled" ? congesSettled.value : [];
      const planningData = planningSettled.status === "fulfilled" ? planningSettled.value : [];

      const congeEvents = congesData.flatMap((row) => {
        const fullName = `${row.prenom || ""} ${row.nom || ""}`.trim() || row.matricule || "Personnel";
        const period = `${asDate(row.date_debut)} -> ${asDate(row.date_fin)}`;
        const statusKey = normalizeStatus(row.statut || "En attente");
        const createdAtKey = stampKey(row.created_at || row.date_debut);
        const updatedAtKey = stampKey(row.updated_at || row.created_at || row.date_debut);
        const createdAt = asTimestamp(row.created_at || row.date_debut);
        const updatedAt = asTimestamp(row.updated_at || row.created_at || row.date_debut);
        const isPending = statusKey.startsWith("en attente");
        const isCanceled = statusKey.startsWith("annul");

        if (isPending) {
          const isUpdated = Boolean(updatedAtKey && createdAtKey && updatedAtKey !== createdAtKey);
          const eventAt = isUpdated ? updatedAt : createdAt || updatedAt;
          return [
            {
              id: isUpdated
                ? `admin-conge-updated-${row.id_conge}-${updatedAtKey}`
                : `admin-conge-created-${row.id_conge}-${createdAtKey || updatedAtKey}`,
              legacyId: isUpdated
                ? `admin-conge-updated-${row.id_conge}-${updatedAt}`
                : `admin-conge-created-${row.id_conge}-${createdAt || updatedAt}`,
              message: isUpdated
                ? `Demande de conge modifiee: ${fullName} (${period}).`
                : `Nouvelle demande de conge: ${fullName} (${period}).`,
              targetTab: "conges",
              targetAction: "openCongePending",
              focusId: row.id_conge,
              createdAt: eventAt,
            },
          ];
        }

        if (isCanceled) {
          return [
            {
              id: `admin-conge-canceled-${row.id_conge}-${updatedAtKey || createdAtKey}`,
              legacyId: `admin-conge-canceled-${row.id_conge}-${updatedAt}`,
              message: `Demande de conge annulee: ${fullName} (${period}).`,
              targetTab: "conges",
              createdAt: updatedAt,
            },
          ];
        }

        return [];
      });

      const planningEvents = planningData.flatMap((row) => {
        const fullName = `${row.prenom || ""} ${row.nom || ""}`.trim() || row.matricule || "Personnel";
        const dateLabel = asDate(row.date_preferee);
        const shiftLabel = normalizeShiftLabel(row.shift_type) || "Shift";
        const statusKey = normalizeStatus(row.statut || "En attente");
        const createdAtKey = stampKey(row.created_at || row.date_preferee);
        const updatedAtKey = stampKey(row.updated_at || row.created_at || row.date_preferee);
        const createdAt = asTimestamp(row.created_at || row.date_preferee);
        const updatedAt = asTimestamp(row.updated_at || row.created_at || row.date_preferee);
        const isPending = statusKey.startsWith("en attente");
        const isCanceled = statusKey.startsWith("annul");

        if (isPending) {
          const isUpdated = Boolean(updatedAtKey && createdAtKey && updatedAtKey !== createdAtKey);
          const eventAt = isUpdated ? updatedAt : createdAt || updatedAt;
          return [
            {
              id: isUpdated
                ? `admin-planning-request-updated-${row.id}-${updatedAtKey}`
                : `admin-planning-request-created-${row.id}-${createdAtKey || updatedAtKey}`,
              legacyId: isUpdated
                ? `admin-planning-request-updated-${row.id}-${updatedAt}`
                : `admin-planning-request-created-${row.id}-${createdAt || updatedAt}`,
              message: isUpdated
                ? `Demande de modification emploi modifiee: ${fullName} (${dateLabel} - ${shiftLabel}).`
                : `Nouvelle demande de modification emploi: ${fullName} (${dateLabel} - ${shiftLabel}).`,
              targetTab: "emplois",
              targetAction: "openPlanningRequests",
              focusId: row.id,
              createdAt: eventAt,
            },
          ];
        }

        if (isCanceled) {
          return [
            {
              id: `admin-planning-request-canceled-${row.id}-${updatedAtKey || createdAtKey}`,
              legacyId: `admin-planning-request-canceled-${row.id}-${updatedAt}`,
              message: `Demande de modification emploi annulee: ${fullName} (${dateLabel} - ${shiftLabel}).`,
              targetTab: "emplois",
              targetAction: "openPlanningRequests",
              focusId: row.id,
              createdAt: updatedAt,
            },
          ];
        }

        return [];
      });

      const merged = [...congeEvents, ...planningEvents]
        .filter(
          (item) =>
            item?.id &&
            !seenNotificationIds.includes(item.id) &&
            (!item.legacyId || !seenNotificationIds.includes(item.legacyId))
        )
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      setNotifications(merged);
    } catch {
      setNotifications([]);
    }
  }, [seenNotificationIds]); 

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNotifications();
    const timer = setInterval(loadNotifications, 60000);
    return () => clearInterval(timer);
  }, [loadNotifications]);

  useEffect(() => {
    if (active === "conges" || active === "emplois") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadNotifications();
    }
  }, [active, loadNotifications]);

  const markNotificationsAsSeen = useCallback((ids = null) => {
    const idsToMark = Array.isArray(ids) && ids.length ? ids : notifications.map((n) => n.id);
    if (!idsToMark.length) return;
    const expandedIds = Array.from(
      new Set([
        ...idsToMark,
        ...idsToMark
          .map((id) => notifications.find((n) => n.id === id)?.legacyId)
          .filter((v) => typeof v === "string" && v.length),
      ])
    );
    setSeenNotificationIds((prev) => {
      const merged = Array.from(new Set([...prev, ...expandedIds]));
      try {
        localStorage.setItem(seenStorageKey, JSON.stringify(merged));
      } catch {
        // Ignore 
      }
      return merged;
    });
    setNotifications((prev) => prev.filter((n) => !expandedIds.includes(n.id)));
  }, [notifications, seenStorageKey]);

  const renderContent = () => {
    switch (active) {
      case "personnel":
        return <PersonnelPage />;
      case "services":
        return <ServicesPage />;
      case "emplois":
        return <PlanningAdminPage />;
      case "conges":
        return <AdminCongesPage />;
      case "dashboard":
      default:
        return <DashboardPage onNavigatePersonnel={() => setActive("personnel")} />;
    }
  };

  return (
    <div className="admin-shell dark">
      <AdminSidebar
        active={active}
        onNavigate={setActive}
        onLogout={onLogout}
        notifications={notifications}
        onNotificationsSeen={markNotificationsAsSeen}
      />
      <main className="admin-main">
        {renderContent()}
      </main>
      <Chatbot 
        title="Assistant Admin" 
        subtitle="Gestion RH & Personnel" 
        welcomeMessage="Bonjour Administrateur ! Que souhaitez-vous vérifier ou gérer aujourd'hui ?" 
        theme="admin" 
      />
    </div>
  );
}