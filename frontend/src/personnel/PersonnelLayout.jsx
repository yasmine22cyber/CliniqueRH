import { useCallback, useEffect, useMemo, useState } from "react";
import AdminSidebar, { sidebarIcons } from "../admin/AdminSidebar";
import PlanningPage from "./pages/Planning";
import CongesPage from "./pages/Conges";
import DashboardPage from "./pages/Dashboard";
import Chatbot from "../components/Chatbot";
import "../admin/admin.css";
import "./personnel.css";

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
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR");
};

const asTimestamp = (value) => {
  const d = new Date(value);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
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

const getAuthHeaders = () => {
  try {
    const token = localStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  } catch {
    return undefined;
  }
};

const getGradeLabel = (gradeValue = "") => {
  const raw = gradeValue.toString().trim();
  if (!raw) return "Espace Personnel";
  return raw;
};

export default function PersonnelLayout({ initialTab = "dashboard", onLogout }) {
  const [active, setActive] = useState(initialTab);
  const [notifications, setNotifications] = useState([]);
  const [seenNotificationIds, setSeenNotificationIds] = useState([]);
  const [brandSubtitle, setBrandSubtitle] = useState("Espace Personnel");
  const [personnelNameByMatricule, setPersonnelNameByMatricule] = useState({});

  const navItems = useMemo(
    () => [
      { key: "dashboard", label: "Profil", icon: sidebarIcons.home, subtitle: "Vue globale" },
      { key: "planning", label: "Mon Emploi du Temps", icon: sidebarIcons.calendar, subtitle: "Consultation" },
      { key: "conges", label: "Mes Congés", icon: sidebarIcons.calendar, subtitle: "Demander / suivre" },
    ],
    []
  );

  const matricule = useMemo(() => {
    try {
      const raw = localStorage.getItem("authUser");
      const user = raw ? JSON.parse(raw) : null;
      return user?.matricule || "";
    } catch {
      return "";
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resolveGrade = async () => {
      let user = null;
      let localGrade = "Espace Personnel";

      try {
        const raw = localStorage.getItem("authUser");
        user = raw ? JSON.parse(raw) : null;
        localGrade = getGradeLabel(user?.grade || "");
      } catch {
        localGrade = "Espace Personnel";
      }

      if (localGrade !== "Espace Personnel") {
        if (!cancelled) setBrandSubtitle(localGrade);
        return;
      }

      if (!matricule) {
        if (!cancelled) setBrandSubtitle("Espace Personnel");
        return;
      }

      try {
        const resp = await fetch(`${API_BASE_URL}/api/personnel`);
        const data = await resp.json().catch(() => []);
        if (!resp.ok) throw new Error("Chargement personnel impossible.");

        const me = (Array.isArray(data) ? data : []).find(
          (row) => String(row?.matricule || "").trim() === String(matricule).trim()
        );
        const dbGrade = getGradeLabel(me?.grade || "");

        if (!cancelled) setBrandSubtitle(dbGrade);

        if (dbGrade !== "Espace Personnel") {
          try {
            const nextUser = {
              ...(user || {}),
              grade: me?.grade || "",
              id_grade: me?.id_grade || "",
            };
            localStorage.setItem("authUser", JSON.stringify(nextUser));
          } catch {
            // 
          }
        }
      } catch {
        if (!cancelled) setBrandSubtitle("Espace Personnel");
      }
    };

    resolveGrade();
    return () => {
      cancelled = true;
    };
  }, [matricule]);

  useEffect(() => {
    let cancelled = false;

    const loadPersonnelNames = async () => {
      if (!matricule) {
        if (!cancelled) setPersonnelNameByMatricule({});
        return;
      }

      try {
        const resp = await fetch(`${API_BASE_URL}/api/personnel`, {
          headers: getAuthHeaders(),
        });
        const data = await resp.json().catch(() => []);
        if (!resp.ok) throw new Error("Chargement personnel impossible.");

        const nextMap = {};
        (Array.isArray(data) ? data : []).forEach((row) => {
          const rowMatricule = String(row?.matricule || "").trim();
          if (!rowMatricule) return;
          const fullName = `${row?.prenom || ""} ${row?.nom || ""}`.replace(/\s+/g, " ").trim();
          nextMap[rowMatricule] = fullName || rowMatricule;
        });

        if (!cancelled) setPersonnelNameByMatricule(nextMap);
      } catch {
        if (!cancelled) setPersonnelNameByMatricule({});
      }
    };

    loadPersonnelNames();
    return () => {
      cancelled = true;
    };
  }, [matricule]);

  const seenStorageKey = useMemo(
    () => (matricule ? `personnel_seen_notifications_${matricule}` : ""),
    [matricule]
  );

  useEffect(() => {
    if (!seenStorageKey) {
      setSeenNotificationIds([]);
      return;
    }
    try {
      const raw = localStorage.getItem(seenStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setSeenNotificationIds(Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : []);
    } catch {
      setSeenNotificationIds([]);
    }
  }, [seenStorageKey]);

  const loadNotifications = useCallback(async () => {
    if (!matricule) {
      setNotifications([]);
      return;
    }
    try {
      const [congesSettled, planningSettled] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/api/conges?matricule=${encodeURIComponent(matricule)}`, {
          headers: getAuthHeaders(),
        }).then(async (resp) => {
          const json = await resp.json().catch(() => []);
          if (!resp.ok) throw new Error("Conges load failed.");
          return Array.isArray(json) ? json : [];
        }),
        fetch(
          `${API_BASE_URL}/api/planning-requests?matricule=${encodeURIComponent(
            matricule
          )}&include_replacements=1`,
          {
          headers: getAuthHeaders(),
          }
        ).then(async (resp) => {
          const json = await resp.json().catch(() => []);
          if (!resp.ok) throw new Error("Planning requests load failed.");
          return Array.isArray(json) ? json : [];
        }),
      ]);

      const congesData = congesSettled.status === "fulfilled" ? congesSettled.value : [];
      const planningData = planningSettled.status === "fulfilled" ? planningSettled.value : [];

      const congeEvents = congesData.map((row) => {
        const period = `${asDate(row.date_debut)} -> ${asDate(row.date_fin)}`;
        const statusKey = normalizeStatus(row.statut || "En attente");
        const createdAt = asTimestamp(row.updated_at || row.created_at || row.date_debut);

        if (statusKey.startsWith("approuv")) {
          return {
            id: `conge-approved-${row.id_conge}`,
            targetTab: "conges",
            targetAction: "openCongesHistory",
            focusId: row.id_conge,
            message: `Votre demande de conge (${period}) est approuvee.`,
            createdAt,
          };
        }
        if (statusKey.startsWith("refus")) {
          return {
            id: `conge-refused-${row.id_conge}`,
            targetTab: "conges",
            targetAction: "openCongesHistory",
            focusId: row.id_conge,
            message: `Votre demande de conge (${period}) a ete refusee.`,
            createdAt,
          };
        }
        return null;
      });

      const planningEvents = planningData.map((row) => {
        const dateLabel = asDate(row.date_preferee);
        const shiftLabel = normalizeShiftLabel(row.shift_type) || "Shift";
        const statusKey = normalizeStatus(row.statut || "En attente");
        const createdAt = asTimestamp(row.updated_at || row.created_at || row.date_preferee);
        const ownerMatricule = String(row?.matricule || "");
        const replacementMatricule = String(row?.replacement_matricule || "");
        const ownerNameFromRow = `${row?.prenom || ""} ${row?.nom || ""}`.replace(/\s+/g, " ").trim();
        const ownerLabel =
          ownerNameFromRow || personnelNameByMatricule[ownerMatricule] || ownerMatricule || "personnel";
        const isOwner = ownerMatricule && ownerMatricule === matricule;
        const isReplacement =
          replacementMatricule && replacementMatricule === matricule && ownerMatricule !== matricule;

        if (statusKey.startsWith("approuv")) {
          if (isOwner) {
            return {
              id: `planning-request-approved-${row.id}`,
              targetTab: "planning",
              targetAction: "openPlanningHistory",
              focusId: row.id,
              message: `Votre demande de modification emploi (${dateLabel} - ${shiftLabel}) est approuvee.`,
              createdAt,
            };
          }
          if (isReplacement) {
            return {
              id: `planning-replacement-assigned-${row.id}-${createdAt}`,
              targetTab: "planning",
              message: `Vous etes designe(e) comme remplacant(e) le ${dateLabel} (pour le personnel ${ownerLabel}).`,
              createdAt,
            };
          }
          return null;
        }
        if (statusKey.startsWith("refus")) {
          if (!isOwner) return null;
          return {
            id: `planning-request-refused-${row.id}`,
            targetTab: "planning",
            targetAction: "openPlanningHistory",
            focusId: row.id,
            message: `Votre demande de modification emploi (${dateLabel} - ${shiftLabel}) a ete refusee.`,
            createdAt,
          };
        }
        return null;
      });

      const merged = [...congeEvents, ...planningEvents]
        .filter((item) => item?.id && !seenNotificationIds.includes(item.id))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      setNotifications(merged);
    } catch {
      setNotifications([]);
    }
  }, [matricule, personnelNameByMatricule, seenNotificationIds]);

  const markNotificationsAsSeen = useCallback((ids = null) => {
    const idsToMark = Array.isArray(ids) && ids.length ? ids : notifications.map((n) => n.id);
    if (!idsToMark.length) return;
    setSeenNotificationIds((prev) => {
      const merged = Array.from(new Set([...prev, ...idsToMark]));
      if (seenStorageKey) {
        try {
          localStorage.setItem(seenStorageKey, JSON.stringify(merged));
        } catch {
          // 
        }
      }
      return merged;
    });
    setNotifications((prev) => prev.filter((n) => !idsToMark.includes(n.id)));//ay notif tchafit titfasa5 milliste
  }, [notifications, seenStorageKey]);

  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, 60000);
    return () => clearInterval(timer);
  }, [loadNotifications]);

  useEffect(() => {
    if (active === "conges" || active === "planning") loadNotifications();
  }, [active, loadNotifications]);

  const content = () => {
    switch (active) {
      case "conges":
        return <CongesPage />;
      case "planning":
        return <PlanningPage />;
      case "dashboard":
      default:
        return (
          <DashboardPage
            onGoToConges={() => setActive("conges")}
            onGoToPlanning={() => setActive("planning")}
          />
        );
    }
  };

  return (
    <div className="admin-shell dark personnel-shell">
      <AdminSidebar
        active={active}
        onNavigate={setActive}
        onLogout={onLogout}
        navItems={navItems}
        brandSubtitle={brandSubtitle}
        brandTitle="Clinique RH"
        notifications={notifications}
        onNotificationsSeen={markNotificationsAsSeen}
        showLogout={true}
      />
      <main className="admin-main">{content()}</main>
      <Chatbot 
        title="Mon Assistant" 
        subtitle="Espace Personnel" 
        welcomeMessage="Bonjour ! Je suis là pour vous aider avec vos horaires, congés et pointages." 
        theme="personnel" 
      />
    </div>
  );
}