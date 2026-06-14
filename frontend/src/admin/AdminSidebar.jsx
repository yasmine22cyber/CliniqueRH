import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const Icon = ({ path }) => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d={path} />
  </svg>
);

const BrandLogo = () => (
  <svg width="64" height="64" viewBox="0 0 64 64">
    {/* Left heart */}
    <path
      d="M32 50 L12 30 A10 10 0 0 1 32 18 Z"
      fill="#39A7B5"
    />

    {/* Right heart */}
    <path
      d="M32 50 L52 30 A10 10 0 0 0 32 18 Z"
      fill="#4B4A73"
    />

    {/* Medical cross */}
    <rect x="28" y="24" width="8" height="20" fill="white"/>
    <rect x="22" y="30" width="20" height="8" fill="white"/>

   
  </svg>
);
// eslint-disable-next-line react-refresh/only-export-components 
export const sidebarIcons = {
  bell: "M8 16a2 2 0 0 0 1.985-1.75H6.015A2 2 0 0 0 8 16zM8 1a5 5 0 0 0-5 5v2.086l-.707.707A1 1 0 0 0 3 10.5h10a1 1 0 0 0 .707-1.707L13 8.086V6a5 5 0 0 0-5-5z",
  chevron: "M1.646 5.646a.5.5 0 0 1 .708 0L8 11.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z",
  home: "M8 3.293l6 6V14a1 1 0 0 1-1 1h-3v-3H6v3H3a1 1 0 0 1-1-1v-4.707l6-6zm5-.293V2a1 1 0 0 0-1-1h-1v2.293l2 2zM3 3V1H2a1 1 0 0 0-1 1v2.293l2-2z",
  people:
    "M10 5a2 2 0 1 1 4 0 2 2 0 0 1-4 0zm-6 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm-2 7c0-1.657 2.686-3 6-3s6 1.343 6 3v1H2v-1zm14 1v-1c0-.768-.363-1.469-.97-2.053C15.64 8.897 14.307 8 13 8c-.716 0-1.385.176-1.983.48A4.4 4.4 0 0 1 12 10.5c0 .914-.253 1.77-.694 2.5H16z",
  services:
    "M2.5 2A1.5 1.5 0 0 0 1 3.5v2A1.5 1.5 0 0 0 2.5 7h3A1.5 1.5 0 0 0 7 5.5v-2A1.5 1.5 0 0 0 5.5 2h-3zm0 7A1.5 1.5 0 0 0 1 10.5v2A1.5 1.5 0 0 0 2.5 14h3A1.5 1.5 0 0 0 7 12.5v-2A1.5 1.5 0 0 0 5.5 9h-3zM10.5 2A1.5 1.5 0 0 0 9 3.5v2A1.5 1.5 0 0 0 10.5 7h3A1.5 1.5 0 0 0 15 5.5v-2A1.5 1.5 0 0 0 13.5 2h-3zm0 7A1.5 1.5 0 0 0 9 10.5v2a1.5 1.5 0 0 0 1.5 1.5h3a1.5 1.5 0 0 0 1.5-1.5v-2A1.5 1.5 0 0 0 13.5 9h-3z",
  calendar:
    "M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM1 5v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5H1z",
  logout:
    "M10 12.5a.5.5 0 0 1-.5.5h-4A1.5 1.5 0 0 1 4 11.5v-7A1.5 1.5 0 0 1 5.5 3h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 .5.5z M12.854 8.354a.5.5 0 0 0 0-.708l-2-2a.5.5 0 1 0-.708.708L11.293 7.5H7.5a.5.5 0 0 0 0 1h3.793l-1.147 1.146a.5.5 0 1 0 .708.708l2-2z",
  timeoff:
    "M2 2.5A2.5 2.5 0 0 1 4.5 0h7A2.5 2.5 0 0 1 14 2.5v5.764a2.5 2.5 0 0 1-.732 1.768l-3.236 3.236a2.5 2.5 0 0 1-1.768.732H4.5A2.5 2.5 0 0 1 2 11.5v-9zm2.5-1a1 1 0 0 0-1 1V11.5a1 1 0 0 0 1 1H8v-3.5A2.5 2.5 0 0 1 10.5 6h3V2.5a1 1 0 0 0-1-1h-7z",
};

export default function AdminSidebar({
  active,
  onNavigate,
  onLogout,
  navItems,
  brandSubtitle = "Espace Administration",
  brandTitle = "Clinique RH",
  notifications: customNotifications,
  onNotificationsSeen,
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifRef = useRef(null);
  const profileRef = useRef(null);
  const pendingSeenRef = useRef(false);

  const identity = useMemo(() => {
    try {
      const raw = localStorage.getItem("authUser");
      const user = raw ? JSON.parse(raw) : null;
      const first = (user?.prenom || user?.firstName || "").trim();
      const last = (user?.nom || user?.lastName || "").trim();
      const full = (user?.name || user?.fullName || `${first} ${last}`).trim();
      const displayName = full || "Admin RH";
      const email = (user?.email || "").trim();
      const matricule = (
        user?.matricule ||
        user?.Matricule ||
        user?.employeeId ||
        user?.personnelId ||
        ""
      )
        .toString()
        .trim();
      const handle =
        email && email.includes("@")
          ? `@${email.split("@")[0]}`
          : `@${displayName.toLowerCase().replace(/\s+/g, "")}`;
      const initials = displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("");
      return {
        displayName,
        handle,
        initials: initials || "AR",
        firstName: first || "-",
        lastName: last || "-",
        email: email || "-",
        matricule: matricule || "-",
      };
    } catch {
      return {
        displayName: "Admin RH",
        handle: "@administrateur",
        initials: "AR",
        firstName: "-",
        lastName: "-",
        email: "-",
        matricule: "-",
      };
    }
  }, []);

  const notifications = useMemo(
    () => (Array.isArray(customNotifications) ? customNotifications : []),
    [customNotifications]
  );
  const notificationCount = notifications.length;
  const hasNotifications = notificationCount > 0;
  const badgeLabel = notificationCount > 99 ? "99+" : String(notificationCount);

  const closeNotifications = useCallback((markAsSeen = true) => {
    if (markAsSeen && pendingSeenRef.current) {
      onNotificationsSeen?.();
    }
    pendingSeenRef.current = false;
    setNotifOpen(false);
  }, [onNotificationsSeen]);

  const handleNotificationClick = useCallback(
    (notification) => {
      const targetTab = notification?.targetTab || null;
      const targetAction = notification?.targetAction || null;
      const focusId = notification?.focusId ?? null;
      if (notification?.id) {
        onNotificationsSeen?.([notification.id]);
      }
      if (targetTab && (targetAction || focusId !== null)) {
        try {
          sessionStorage.setItem(
            "nav_intent_v1",
            JSON.stringify({
              tab: targetTab,
              action: targetAction,
              focusId,
              createdAt: Date.now(),
            })
          );
        } catch {
          // 
        }
      }
      pendingSeenRef.current = false;
      setNotifOpen(false);
      if (targetTab) onNavigate(targetTab);
    },
    [onNavigate, onNotificationsSeen]
  );

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        closeNotifications(true);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {  
        closeNotifications(true);
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [closeNotifications]);

  const defaultItems = useMemo(
    () => [
      { key: "dashboard", label: "Tableau de Bord", icon: sidebarIcons.home, subtitle: "Vue Générale" },
      { key: "personnel", label: "Gestion du Personnel", icon: sidebarIcons.people, subtitle: "Suivi des profils, contrats." },
      { key: "services", label: "Gestion des Services", icon: sidebarIcons.services, subtitle: "Suivi des services, responsables et effectifs" },
      { key: "emplois", label: "Gestion des Emplois du Temps", icon: sidebarIcons.calendar, subtitle: "Suivi hebdomadaire" },
      { key: "conges", label: "Validation des Congés", icon: sidebarIcons.timeoff, subtitle: "Demandes à confirmer" },
    ],
    []
  );

  const items = useMemo(() => (navItems && navItems.length ? navItems : defaultItems), [navItems, defaultItems]);

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-brand" aria-label="Clinique RH">
        <span className="admin-sidebar-brand-icon" aria-hidden="true">
          <BrandLogo />
        </span>
        <div className="admin-sidebar-brand-meta">
          <p className="admin-sidebar-brand-title">{brandTitle}</p>
          <p className="admin-sidebar-brand-subtitle">{brandSubtitle}</p>
        </div>
      </div>

      <div className="admin-profile-wrap admin-profile-card" ref={profileRef}>
        <div className="admin-profile">
          <div className="admin-notif-wrap" ref={notifRef}>
            <button
              type="button"
              className={`admin-profile-bell ${notifOpen ? "open" : ""}`}
              onClick={() =>
                setNotifOpen((prev) => {
                  const next = !prev;
                  if (next) {
                    pendingSeenRef.current = hasNotifications;
                    return true;
                  }
                  closeNotifications(true);
                  return false;
                })
              }
              aria-expanded={notifOpen}
              aria-haspopup="menu"
              aria-label={`Notifications${hasNotifications ? ` (${notificationCount})` : ""}`}
            >
              <Icon path={sidebarIcons.bell} />
              {hasNotifications ? <span className="admin-profile-badge">{badgeLabel}</span> : null}
            </button>

            {notifOpen ? (
              <div className="admin-notif-menu" role="menu" aria-label="Notifications">
                <p className="admin-notif-title">Notifications</p>
                {!notifications.length ? (
                  <p className="admin-notif-item admin-notif-empty">Aucune notification.</p>
                ) : (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      className="admin-notif-item admin-notif-item-btn"
                      onClick={() => handleNotificationClick(notification)}
                    >
                      {notification.message}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="admin-profile-trigger"
            onClick={() => {
              closeNotifications(true);
              setProfileOpen((prev) => !prev);
            }}
            aria-expanded={profileOpen}
            aria-controls="admin-profile-details"
          >
            <span className="admin-profile-avatar" aria-hidden="true">
              {identity.initials}
            </span>

            <span className="admin-profile-meta">
              <span className="admin-profile-name">{identity.displayName}</span>
              <span className="admin-profile-handle">{identity.handle}</span>
            </span>
            <span className={`admin-profile-chevron ${profileOpen ? "open" : ""}`} aria-hidden="true">
              <Icon path={sidebarIcons.chevron} />
            </span>
          </button>
        </div>

        {profileOpen ? (
          <div id="admin-profile-details" className="admin-profile-details" role="region" aria-label="Informations du compte">
            <div className="admin-profile-details-row">
              <span className="admin-profile-details-label">Nom</span>
              <span className="admin-profile-details-value">{identity.lastName}</span>
            </div>
            <div className="admin-profile-details-row">
              <span className="admin-profile-details-label">Prenom</span>
              <span className="admin-profile-details-value">{identity.firstName}</span>
            </div>
            <div className="admin-profile-details-row">
              <span className="admin-profile-details-label">Email</span>
              <span className="admin-profile-details-value">{identity.email}</span>
            </div>
            <div className="admin-profile-details-row">
              <span className="admin-profile-details-label">Matricule</span>
              <span className="admin-profile-details-value">{identity.matricule}</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="admin-nav">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={active === item.key ? "active" : ""}
            onClick={() => onNavigate(item.key)}
          >
            <Icon path={item.icon} />
            <span className="admin-nav-text">
              <span className="admin-nav-title">{item.label}</span>
              <span className="admin-nav-subtitle">{item.subtitle}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="admin-nav admin-nav-footer">
        <button onClick={onLogout}>
          <Icon path={sidebarIcons.logout} />
          <span className="admin-nav-text">
            <span className="admin-nav-title">Déconnexion</span>
            <span className="admin-nav-subtitle">Quitter la session</span>
          </span>
        </button>
      </div>
    </aside>
  );
}