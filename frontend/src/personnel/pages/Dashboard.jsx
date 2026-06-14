import { useEffect, useMemo, useRef, useState } from "react";
import "../personnel.css";
import PersonnelProfileEditModal from "../components/PersonnelProfileEditModal";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : "http://localhost:5000");

const normalizeDateValue = (value) => {
  if (!value) return "";
  const str = String(value);
  return str.length >= 10 ? str.slice(0, 10) : str;
};

const parseIsoDate = (value) => {
  const iso = normalizeDateValue(value);
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const displayDate = (value) => {
  const date = parseIsoDate(value);
  if (!date) return "--";
  return date.toLocaleDateString("fr-FR");
};

const normalizeStatus = (value = "") =>
  value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeLoose = (value = "") =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const leaveStatusLabel = (value = "") => {
  const normalized = normalizeStatus(value);
  if (normalized.startsWith("approuv")) return "Approuve";
  if (normalized.startsWith("refus")) return "Refuse";
  if (normalized.startsWith("annul")) return "Annule";
  return "En attente";
};

const leaveStatusTone = (value = "") => {
  const normalized = normalizeStatus(value);
  if (normalized.startsWith("approuv")) return "approuve";
  if (normalized.startsWith("refus")) return "refuse";
  if (normalized.startsWith("annul")) return "annule";
  return "pending";
};

const shortTime = (value) => (value || "--:--").toString().slice(0, 5);

const shortTimeFromDateTime = (value) => {
  if (!value) return "--:--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

const planningNotesText = (value) => {
  const text = (value ?? "").toString().trim();
  return text || "";
};

const getInitials = (fullName = "") =>
  fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "P";

const getAuthHeaders = () => {
  try {
    const token = localStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  } catch {
    return undefined;
  }
};

const fetchJSON = async (url, options = undefined, timeoutMs = 12000) => {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const resp = await fetch(url, {
      ...(options || {}),
      signal: controller?.signal,
    });
    const json = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, data: json, message: json?.message };
  } finally {
    if (timer) window.clearTimeout(timer);
  }
};

const getCurrentWeekRange = () => {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekDay = (base.getDay() + 6) % 7;
  const start = new Date(base);
  start.setDate(base.getDate() - weekDay);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start,
    end,
    startIso: toIsoDate(start),
    endIso: toIsoDate(end),
  };
};

const dayLabel = (value) => {
  const date = parseIsoDate(value);
  if (!date) return "--";
  return date.toLocaleDateString("fr-FR", { weekday: "long" });//esem nhar
};
//tihsibb conge 9dach b3id 3la semaine mo3ayna
const leaveDistanceToWeek = (row, todayIso) => {
  const startIso = normalizeDateValue(row?.date_debut);
  const endIso = normalizeDateValue(row?.date_fin);
  if (!startIso && !endIso) return Number.MAX_SAFE_INTEGER;
  if (startIso <= todayIso && endIso >= todayIso) return 0;
  const pivot = startIso >= todayIso ? startIso : endIso;
  return Math.abs(new Date(`${pivot}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime());
};

const monthLabel = (m) => {
  const d = new Date(2020, Math.max(0, (m || 1) - 1), 1);
  return d.toLocaleDateString("fr-FR", { month: "long" });
};

const getDefaultFichePeriod = (referenceDate = new Date()) => {
  const currentYear = referenceDate.getFullYear();
  const currentMonthIndex = referenceDate.getMonth();
  const currentDay = referenceDate.getDate();
  const lastDayOfCurrentMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate();

  if (currentDay < lastDayOfCurrentMonth) {
    const previousMonth = new Date(currentYear, currentMonthIndex - 1, 1);
    return {
      mois: previousMonth.getMonth() + 1,
      annee: previousMonth.getFullYear(),
    };
  }

  return {
    mois: currentMonthIndex + 1,
    annee: currentYear,
  };
};

const toMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return `${n.toFixed(3)} DT`;
};

const formatHours = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return `${n.toFixed(1)} h`;
};

export default function DashboardPage() {
  const [matricule, setMatricule] = useState("");
  const [sessionUser, setSessionUser] = useState(null);
  const [personnel, setPersonnel] = useState(null);
  const [grades, setGrades] = useState([]);
  const [planningRows, setPlanningRows] = useState([]);
  const [leaveRows, setLeaveRows] = useState([]);//lesconges
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");
  const [fichePaieOpen, setFichePaieOpen] = useState(false);
  const [monthlySummary, setMonthlySummary] = useState(null);
  const [monthlyPayroll, setMonthlyPayroll] = useState(null);
  
  const [ficheMois, setFicheMois] = useState(() => new Date().getMonth() + 1);
  const [ficheAnnee, setFicheAnnee] = useState(() => new Date().getFullYear());
  const [ficheLoading, setFicheLoading] = useState(false);
  const [ficheError, setFicheError] = useState("");
  const [ficheData, setFicheData] = useState(null);
  const [ficheMonthDropdownOpen, setFicheMonthDropdownOpen] = useState(false);

  const [attendanceToday, setAttendanceToday] = useState(null);
  const [geofence, setGeofence] = useState(null);
  const [attendanceBusy, setAttendanceBusy] = useState("");
  const [attendanceError, setAttendanceError] = useState("");
  const [attendanceSuccess, setAttendanceSuccess] = useState("");
  const [lastPosition, setLastPosition] = useState(null);
  const [warnings, setWarnings] = useState([]);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);//ikhazann ilkharita
  const mapLayersRef = useRef({});//ikhazan layers mta3 Map
  const ficheMonthDropdownRef = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("authUser");
      const parsed = raw ? JSON.parse(raw) : null;
      setSessionUser(parsed || null);
      setMatricule((parsed?.matricule || "").toString().trim());
    } catch {
      setSessionUser(null);
      setMatricule("");
    }
  }, []);

  const refreshFiche = async (nextMois = ficheMois, nextAnnee = ficheAnnee) => {
    setFicheLoading(true);
    setFicheError("");
    try {
      const params = new URLSearchParams({
        mois: String(nextMois),
        annee: String(nextAnnee),
      });
      const resp = await fetch(`${API_BASE_URL}/api/payroll/fiche?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.message || "Chargement fiche de paie impossible.");
      setFicheData(json);
    } catch (err) {
      setFicheData(null);
      setFicheError(err?.message || "Erreur."); setTimeout(() => setFicheError(""), 4000);
    } finally {
      setFicheLoading(false);
    }
  };

  useEffect(() => {
    if (!fichePaieOpen) return;
    const { mois, annee } = getDefaultFichePeriod(new Date());
    setFicheMois(mois);
    setFicheAnnee(annee);
    refreshFiche(mois, annee);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichePaieOpen]);

  useEffect(() => {
    if (!fichePaieOpen) setFicheMonthDropdownOpen(false);
  }, [fichePaieOpen]);

  const handleFicheMonthChange = async (nextMois) => {
    const m = Number(nextMois) || 1;
    setFicheMois(m);
    await refreshFiche(m, ficheAnnee);
  };

  const handleFicheYearChange = async (nextAnnee) => {
    const y = Number(nextAnnee) || new Date().getFullYear();
    setFicheAnnee(y);
    await refreshFiche(ficheMois, y);
  };

  useEffect(() => {
    if (!ficheMonthDropdownOpen) return undefined;
    const handleOutside = (event) => {
      if (
        ficheMonthDropdownRef.current &&
        !ficheMonthDropdownRef.current.contains(event.target)
      ) {
        setFicheMonthDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [ficheMonthDropdownOpen]);

  useEffect(() => {
    if (!matricule) {
      setLoading(false);
      setError("Matricule introuvable dans votre session."); setTimeout(() => setError(""), 4000);
      return;
    }

    let cancelled = false;

    const loadDashboard = async () => {
      setLoading(true);
      setError("");
      setWarnings([]);

      try {
        const headers = getAuthHeaders();
        const [
          personnelResp,
          planningResp,
          congesResp,
          gradesResp,
          attendanceResp,
          geofenceResp,
        ] = await Promise.all([
          fetchJSON(`${API_BASE_URL}/api/personnel/profil/${encodeURIComponent(matricule)}`, { headers }),
          fetchJSON(`${API_BASE_URL}/api/planning?matricule=${encodeURIComponent(matricule)}`, { headers }),
          fetchJSON(`${API_BASE_URL}/api/conges?matricule=${encodeURIComponent(matricule)}`, { headers }),
          fetchJSON(`${API_BASE_URL}/api/grades`, { headers }),
          fetchJSON(`${API_BASE_URL}/api/attendance/today`, { headers }),
          fetchJSON(`${API_BASE_URL}/api/attendance/geofence`, { headers }),
        ]);

        const personnelData = personnelResp.data || {};
        const planningData = planningResp.data || [];
        const congesData = congesResp.data || [];
        const gradesData = gradesResp.data || [];
        const attendanceData = attendanceResp.data || {};
        const geofenceData = geofenceResp.data || {};

        if (!personnelResp.ok) throw new Error(personnelData?.message || "Chargement du profil impossible.");
        if (!planningResp.ok) throw new Error(planningData?.message || "Chargement du planning impossible.");
        if (!congesResp.ok) throw new Error(congesData?.message || "Chargement des conges impossible.");
        if (!gradesResp.ok) throw new Error(gradesData?.message || "Chargement des grades impossible.");
        if (cancelled) return;

        const me = personnelData && typeof personnelData === "object" ? personnelData : null;

        const normalizedPlanning = (Array.isArray(planningData) ? planningData : [])
          .filter((row) => String(row?.matricule || "").trim() === matricule)
          .map((row) => ({
            ...row,
            date: normalizeDateValue(row?.date),
          }))
          .sort(
            (a, b) =>
              String(a.date || "").localeCompare(String(b.date || "")) ||
              String(a.start_time || "").localeCompare(String(b.start_time || "")),
          );

        const normalizedLeaves = (Array.isArray(congesData) ? congesData : [])
          .map((row) => ({
            ...row,
            date_debut: normalizeDateValue(row?.date_debut),
            date_fin: normalizeDateValue(row?.date_fin),
          }))
          .sort(
            (a, b) =>
              String(a.date_debut || "").localeCompare(String(b.date_debut || "")) ||
              String(a.date_fin || "").localeCompare(String(b.date_fin || "")),
          );

        setPersonnel(me);
        setGrades(Array.isArray(gradesData) ? gradesData : []);
        setPlanningRows(normalizedPlanning);
        setLeaveRows(normalizedLeaves);
        setAttendanceToday(attendanceResp.ok ? attendanceData : null);
        setGeofence(geofenceResp.ok ? geofenceData : null);

        const loadMonthlyOverview = async () => {
          const today = new Date();
          const monthParams = new URLSearchParams({
            mois: String(today.getMonth() + 1),
            annee: String(today.getFullYear()),
          });

          const [summaryResp, payrollResp] = await Promise.all([
            fetchJSON(`${API_BASE_URL}/api/attendance/me/month-summary?${monthParams.toString()}`, { headers }, 10000),
            fetchJSON(`${API_BASE_URL}/api/payroll/fiche?${monthParams.toString()}`, { headers }, 10000),
          ]);

          if (cancelled) return;

          setMonthlySummary(summaryResp.ok ? summaryResp.data : null);
          setMonthlyPayroll(payrollResp.ok ? payrollResp.data : null);

          const nextWarnings = [];
          if (!attendanceResp.ok) nextWarnings.push("Presence du jour: chargement incomplet.");
          if (!geofenceResp.ok) nextWarnings.push("Geofence: chargement incomplet.");
          if (!summaryResp.ok) nextWarnings.push("KPI mensuels: chargement incomplet.");
          if (!payrollResp.ok) nextWarnings.push("Paie du mois: chargement incomplet.");
          if (nextWarnings.length) setWarnings(nextWarnings);
        };

        loadMonthlyOverview().catch((err) => {
          if (cancelled) return;
          setMonthlySummary(null);
          setMonthlyPayroll(null);
          setWarnings((prev) => [...prev, "KPI mensuels: chargement incomplet."]);
        });
      } catch (err) {
        if (cancelled) return;
        setPersonnel(null);
        setGrades([]);
        setPlanningRows([]);
        setLeaveRows([]);
        setAttendanceToday(null);
        setGeofence(null);
        setMonthlySummary(null);
        setMonthlyPayroll(null);
        setWarnings([]);
        setError(err.message || "Erreur serveur."); setTimeout(() => setError(""), 4000);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [matricule]);

  const fullName = useMemo(() => {
    const first = String(personnel?.prenom || sessionUser?.prenom || "").trim();
    const last = String(personnel?.nom || sessionUser?.nom || "").trim();
    return [first, last].filter(Boolean).join(" ").trim() || "Espace Personnel";
  }, [personnel, sessionUser]);

  const weekRange = useMemo(() => getCurrentWeekRange(), []);

  const currentWeekPlanning = useMemo(
    () =>
      planningRows.filter((row) => {
        const iso = String(row?.date || "");
        return iso >= weekRange.startIso && iso <= weekRange.endIso;
      }),
    [planningRows, weekRange],
  );

  const weekDaysList = useMemo(() => {
    const list = [];
    if (!weekRange.start) return list;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekRange.start);
      d.setDate(d.getDate() + i);
      const iso = toIsoDate(d);
      list.push({
        iso,
        label: dayLabel(iso),
        display: displayDate(iso)
      });
    }
    return list;
  }, [weekRange]);

  const weekPlanningByDay = useMemo(() => {
    const map = new Map();
    weekDaysList.forEach((day) => map.set(day.iso, []));
    currentWeekPlanning.forEach((row) => {
      const iso = String(row?.date || "");
      if (!map.has(iso)) return;
      map.get(iso).push(row);
    });

    for (const list of map.values()) {
      list.sort((a, b) =>
        String(a?.start_time || "").localeCompare(String(b?.start_time || "")),
      );
    }

    return map;
  }, [currentWeekPlanning, weekDaysList]);
  //tikhtarr akrab conge lisemaine twa 
  const nearestWeekLeave = useMemo(() => {
    const todayIso = toIsoDate(new Date());
    const weekLeaves = leaveRows.filter((row) => {
      const startIso = String(row?.date_debut || "");
      const endIso = String(row?.date_fin || startIso);
      return startIso <= weekRange.endIso && endIso >= weekRange.startIso;//ay conge dakhil semaine
    });

    if (!weekLeaves.length) return null;

    return [...weekLeaves].sort((a, b) => leaveDistanceToWeek(a, todayIso) - leaveDistanceToWeek(b, todayIso))[0];
  }, [leaveRows, weekRange]);

  const checkInValue = useMemo(() => {
    const todayIso = toIsoDate(new Date());
    const todayRow = planningRows.find((row) => String(row?.date || "") === todayIso);
    return todayRow ? shortTime(todayRow.start_time) : "--:--";
  }, [planningRows]);

  const checkOutValue = useMemo(() => {
    const todayIso = toIsoDate(new Date());
    const todayRow = planningRows.find((row) => String(row?.date || "") === todayIso);
    return todayRow ? shortTime(todayRow.end_time) : "--:--";
  }, [planningRows]);

  const effectiveCheckInValue = useMemo(() => {
    if (attendanceToday?.check_in_time) return shortTimeFromDateTime(attendanceToday.check_in_time);
    return checkInValue;
  }, [attendanceToday, checkInValue]);

  const effectiveCheckOutValue = useMemo(() => {
    if (attendanceToday?.check_out_time) return shortTimeFromDateTime(attendanceToday.check_out_time);
    return checkOutValue;
  }, [attendanceToday, checkOutValue]);

  const monthSummaryMetrics = monthlySummary?.metrics || {};
  const monthLateItems = Array.isArray(monthlySummary?.late_items) ? monthlySummary.late_items : [];
  const monthPayrollFiche = monthlyPayroll?.fiche || null;
  const currentMonthLabel =
    monthlySummary?.month?.label ||
    new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const currentMonthTitle = currentMonthLabel.charAt(0).toUpperCase() + currentMonthLabel.slice(1);
  const profileRecord = personnel || {};
  const monthlyKpiCards = [
    {
      label: "Retards du mois",
      value: loading ? "--" : String(monthSummaryMetrics.late_days ?? 0),
      meta: monthLateItems.length
        ? `${monthLateItems.length} pointage(s) en retard`
        : "Aucun retard detecte",
      tone: "warning",
    },
    {
      label: "Absences du mois",
      value: loading ? "--" : String(monthSummaryMetrics.absent_days ?? 0),
      meta: `${monthSummaryMetrics.planned_days ?? 0} jours planifies`,
      tone: "danger",
    },
    {
      label: "Conges approuves",
      value: loading ? "--" : String(monthSummaryMetrics.approved_leave_days ?? 0),
      meta: `${monthSummaryMetrics.approved_leave_requests ?? 0} demande(s) validee(s)`,
      tone: "success",
    },
    {
      label: "Heures travaillees",
      value: loading ? "--" : formatHours(monthPayrollFiche?.heures_travaillees),
      meta: monthPayrollFiche
        ? `${formatHours(monthPayrollFiche?.heures_manquantes)} manquantes | ${formatHours(monthPayrollFiche?.total_heures_supp)} supp`
        : "Calcul du mois en cours",
      tone: "primary",
    },
  ];

  useEffect(() => {
    const L = typeof window !== "undefined" ? window.L : null; //asque leaflet mawjoda o non
    if (!L) return;
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    const geoLat = Number.parseFloat(geofence?.latitude);
    const geoLng = Number.parseFloat(geofence?.longitude);
    const hasGeoCenter = Boolean(geofence?.enabled && Number.isFinite(geoLat) && Number.isFinite(geoLng));//coordonnee shah??
    const fallback = hasGeoCenter ? [geoLat, geoLng] : [36.8065, 10.1815];//ken famaesh position,par defaut position tunis
    //creation de map  avec + - © OpenStreetMap
    mapRef.current = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(fallback, 16);
    
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(mapRef.current);

    return () => {
      try {
        mapRef.current?.remove();
      } catch {
        //
      }
      mapRef.current = null;
      mapLayersRef.current = {};
    };
  }, [geofence]);

  useEffect(() => {
    const L = typeof window !== "undefined" ? window.L : null;
    const map = mapRef.current;
    if (!L || !map) return;

    const layers = mapLayersRef.current || {};

    const clearLayer = (key) => {
      const layer = layers[key];
      if (!layer) return;
      try {
        map.removeLayer(layer);
      } catch {
        // 
      }
      delete layers[key];
    };

    clearLayer("geofenceCircle");
    clearLayer("geofenceMarker");
    clearLayer("posMarker");
    clearLayer("posAccuracy");

    const geoLat = Number.parseFloat(geofence?.latitude);
    const geoLng = Number.parseFloat(geofence?.longitude);
    const geoRadius = Number.parseFloat(geofence?.radius_m);

    if (geofence?.enabled && Number.isFinite(geoLat) && Number.isFinite(geoLng) && Number.isFinite(geoRadius) && geoRadius > 0) {
      const center = [geoLat, geoLng];
      //rasman cercle ilimasmo7 bih ikon fih personnel 
      layers.geofenceCircle = L.circle(center, {
        radius: geoRadius,
        color: "#2563eb",
        weight: 2,
        fillColor: "#93c5fd",
        fillOpacity: 0.2,
      }).addTo(map);
      layers.geofenceMarker = L.marker(center).addTo(map);
    }

    const posLat = Number.parseFloat(lastPosition?.latitude);
    const posLng = Number.parseFloat(lastPosition?.longitude);
    if (Number.isFinite(posLat) && Number.isFinite(posLng)) {
      const pos = [posLat, posLng];
      layers.posMarker = L.marker(pos).addTo(map);//yamall logo mta3position
      if (Number.isFinite(lastPosition.accuracy_m) && lastPosition.accuracy_m > 0) {
        layers.posAccuracy = L.circle(pos, {
          radius: lastPosition.accuracy_m,
          color: "#16a34a",
          weight: 1,
          fillColor: "#86efac",
          fillOpacity: 0.15,
        }).addTo(map);
      }
      map.setView(pos, 17);
    } else if (geofence?.enabled && Number.isFinite(geoLat) && Number.isFinite(geoLng)) {
      map.setView([geoLat, geoLng], 16);
    }

    mapLayersRef.current = layers;
  }, [geofence, lastPosition]);

  const getBrowserPosition = () =>
    new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(new Error("La geolocalisation n'est pas supportee sur ce navigateur."));
        return;
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });

  const handleAttendance = async (eventType) => {
    if (!matricule) return;
    if (attendanceBusy) return;

    setAttendanceError("");
    setAttendanceSuccess("");

    try {
      setAttendanceBusy(eventType);
      const position = await getBrowserPosition();
      const coords = position?.coords || {};
      const payload = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy_m: coords.accuracy,
        client_time: new Date().toISOString(),
      };

      setLastPosition(payload);

      const headers = {
        "Content-Type": "application/json",
        ...(getAuthHeaders() || {}),
      };

      const endpoint = eventType === "check_in" ? "check-in" : "check-out";
      const resp = await fetch(`${API_BASE_URL}/api/attendance/${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.message || "Pointage impossible.");
      }

      setAttendanceToday(data?.summary || null);
      setAttendanceSuccess(eventType === "check_in" ? "Check-in enregistre." : "Check-out enregistre."); setTimeout(() => setAttendanceSuccess(""), 4000);
    } catch (err) {
      const message = err?.message || "Erreur de pointage.";
      setAttendanceError(message); setTimeout(() => setAttendanceError(""), 4000);
    } finally {
      setAttendanceBusy("");
    }
  };

  const infoItems = useMemo(
    () => {
      const gradeById = new Map(
        grades
          .filter((item) => item?.id !== null && item?.id !== undefined)
          .map((item) => [String(item.id), item]),
      );
      const gradeByLabel = new Map(
        grades
          .filter((item) => item?.label || item?.type_de_grade || item?.nom)
          .map((item) => [
            normalizeLoose(item.label || item.type_de_grade || item.nom || ""),
            item,
        ]),
      );

      const directSalary =
        profileRecord?.salaire ||
        profileRecord?.salary ||
        profileRecord?.salaire_mensuel ||
        null;
      let resolvedSalary = directSalary;

      if (resolvedSalary === null || resolvedSalary === undefined || resolvedSalary === "") {
        const idKey = String(profileRecord?.id_grade ?? "").trim();
        const labelKey = normalizeLoose(profileRecord?.grade || "");
        if (idKey && gradeById.has(idKey)) {
          resolvedSalary = gradeById.get(idKey)?.salaire ?? gradeById.get(idKey)?.salary ?? null;
        } else if (labelKey && gradeByLabel.has(labelKey)) {
          const match = gradeByLabel.get(labelKey);
          resolvedSalary = match?.salaire ?? match?.salary ?? null;
        }
      }

      return [
        profileRecord?.matricule ? { label: "Matricule", value: profileRecord.matricule } : null,
        profileRecord?.email ? { label: "Email", value: profileRecord.email } : null,
        profileRecord?.service ? { label: "Service", value: profileRecord.service } : null,
        profileRecord?.date_embauche ? { label: "Date d'embauche", value: displayDate(profileRecord.date_embauche) } : null,
        profileRecord?.adresse ? { label: "Adresse", value: profileRecord.adresse } : null,
        resolvedSalary !== null && resolvedSalary !== undefined && resolvedSalary !== ""
          ? { label: "Salaire", value: `${resolvedSalary} DT/mois` }
          : null,
      ].filter(Boolean);
    },
    [grades, profileRecord],
  );

  const handleProfileSubmit = async (payload) => {
    if (!matricule) return;
    try {
      setEditSaving(true);
      setEditError("");
      setEditSuccess("");
      const headers = {
        "Content-Type": "application/json",
        ...(getAuthHeaders() || {}),
      };
      const resp = await fetch(`${API_BASE_URL}/api/personnel/profil/${encodeURIComponent(matricule)}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.message || "Mise a jour impossible.");
      }

      setPersonnel((prev) =>
        prev
          ? {
            ...prev,
            email: payload.email,
            num_telephone: payload.phone,
            adresse: payload.adresse,
          }
          : prev,
      );

      setSessionUser((prev) =>
        prev
          ? {
            ...prev,
            email: payload.email,
          }
          : prev,
      );

      try {
        const raw = localStorage.getItem("authUser");
        const parsed = raw ? JSON.parse(raw) : {};
        localStorage.setItem("authUser", JSON.stringify({ ...parsed, email: payload.email }));
      } catch {
        //
      }

      setEditOpen(false);
      setEditSuccess("Profil mis à jour avec succès."); setTimeout(() => setEditSuccess(""), 4000);
    } catch (err) {
      setEditError(err.message || "Erreur serveur."); setTimeout(() => setEditError(""), 4000);
    } finally {
      setEditSaving(false);
    }
  };

  const ficheAvailability = useMemo(() => {
    const selectedMois = Number(ficheMois);
    const selectedAnnee = Number(ficheAnnee);
    const today = new Date();
    const currentMois = today.getMonth() + 1;
    const currentAnnee = today.getFullYear();

    if (selectedAnnee > currentAnnee || (selectedAnnee === currentAnnee && selectedMois > currentMois)) {
      return {
        blocked: true,
        message: "Ce mois n'est pas encore arrive. La fiche de paie n'est pas disponible.",
      };
    }

    if (personnel?.date_embauche) {
      const embauche = parseIsoDate(personnel.date_embauche);
      if (embauche) {
        const embaucheMois = embauche.getMonth() + 1;
        const embaucheAnnee = embauche.getFullYear();
        if (selectedAnnee < embaucheAnnee || (selectedAnnee === embaucheAnnee && selectedMois < embaucheMois)) {
          return {
            blocked: true,
            message: "Vous n'avez pas de fiche de paie pour ce mois, car il precede votre date d'embauche.",
          };
        }
      }
    }

    if (selectedAnnee === currentAnnee && selectedMois === currentMois) {
      const lastDayOfMonth = new Date(currentAnnee, currentMois, 0).getDate();
      if (today.getDate() < lastDayOfMonth) {
        const availableOn = new Date(currentAnnee, currentMois - 1, lastDayOfMonth).toLocaleDateString("fr-FR");
        return {
          blocked: true,
          message: `La fiche de paie du mois actuel n'est pas encore disponible. Elle sera disponible le ${availableOn}.`,
        };
      }
    }

    return { blocked: false, message: "" };
  }, [ficheMois, ficheAnnee, personnel?.date_embauche]);

  const canPrintFiche = Boolean(ficheData?.fiche) && !ficheLoading && !ficheAvailability.blocked;

  const handlePrintFiche = () => {
    if (!canPrintFiche) {
      const fallbackMessage = ficheAvailability.message || "Aucune fiche de paie disponible a imprimer pour cette periode.";
      setFicheError(fallbackMessage);
      setTimeout(() => setFicheError(""), 4000);
      return;
    }
    window.print();
  };

  return (
    <div className="admin-card personnel-dashboard-prototype">
      <div className="personnel-dashboard-prototype-head">
        <div className="personnel-page-title-wrap">
          <span className="personnel-page-title-line" aria-hidden="true" />
          <div>
            <h3 className="personnel-page-title mb-1">Espace personnel</h3>
            <div className="personnel-page-subtitle">Tableau de bord de la semaine en cours</div>
          </div>
        </div>
      </div>

      {error ? <div className="alert alert-danger py-2 mb-3">{error}</div> : null}
      {editSuccess ? <div className="alert alert-success py-2 mb-3">{editSuccess}</div> : null}
      {loading ? <div className="alert alert-info py-2 mb-3">Chargement des donnees...</div> : null}

      <div className="admin-bi-kpi-row personnel-dashboard-kpi-row">
        {monthlyKpiCards.map((card) => (
          <div key={card.label} className="personnel-dashboard-kpi-item">
            <div className={`stat-card bg-gradient-${card.tone} text-white`}>
              <div className="stat-title">{card.label}</div>
              <div className="stat-value">{card.value}</div>
              <div className="admin-bi-kpi-sub">{card.meta}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="admin-bi-layout personnel-dashboard-bi-layout">
        <div className="admin-bi-content">
          <div className="personnel-dashboard-shell">
          <section className="personnel-dashboard-hero-card">
            <div className="personnel-dashboard-hero-main">
              <div className="personnel-dashboard-avatar">{getInitials(fullName)}</div>

              <div className="personnel-dashboard-identity">
                <div className="personnel-dashboard-identity-top">
                  <div>
                    <div className="personnel-dashboard-kicker">Profil Personnel</div>
                    <h4>{fullName}</h4>
                  </div>
                  <button className="btn admin-accent-btn" type="button" onClick={() => setEditOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <ion-icon name="settings-outline"></ion-icon>
                    Modifier information
                  </button>
                </div>

                <div className="personnel-dashboard-role-row">
                  {personnel?.service ? <span>{personnel.service}</span> : null}
                </div>

                <div className="personnel-dashboard-info-row">
                  {infoItems.length ? (
                    infoItems.map((item) => (
                      <div className="personnel-dashboard-info-item" key={item.label}>
                        <span>{item.label} :</span>
                        {normalizeStatus(item.label) === "salaire" ? (
                          <strong>
                            <button
                              type="button"
                              onClick={() => setFichePaieOpen(true)}
                              className="btn btn-link p-0"
                              style={{ fontWeight: "800", textDecoration: "underline", color: "#0f172a", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              {item.value}
                              <ion-icon name="document-text-outline" style={{ marginLeft: "4px" }}></ion-icon>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m9 18 6-6-6-6"/>
                              </svg>
                            </button>
                          </strong>
                        ) : (
                          <strong>{item.value}</strong>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="personnel-dashboard-empty">Aucune information personnelle disponible.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="personnel-dashboard-attendance-grid">
              <div className="personnel-dashboard-check-column">
                {/* Check-In card */}
                <button
                  className="personnel-dashboard-check-card checkin"
                  type="button"
                  disabled={attendanceBusy === "check_in"}
                  onClick={() => handleAttendance("check_in")}
                >
                  <div className="personnel-dashboard-check-icon">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                      <circle cx="8" cy="15" r="1" fill="currentColor"/>
                      <circle cx="12" cy="15" r="1" fill="currentColor"/>
                      <circle cx="16" cy="15" r="1" fill="currentColor"/>
                    </svg>
                  </div>
                  <div className="personnel-dashboard-check-info">
                    <span className="personnel-dashboard-check-label">CHECK-IN</span>
                    <div className="personnel-dashboard-check-meta">
                      <div className="personnel-dashboard-check-meta-row">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/>
                          <line x1="8" y1="2" x2="8" y2="6"/>
                          <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        {attendanceToday?.check_in_time
                          ? new Date(attendanceToday.check_in_time).toLocaleDateString("fr-FR")
                          : "--/--/----"}
                      </div>
                      <div className="personnel-dashboard-check-meta-row">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        {effectiveCheckInValue}
                      </div>
                    </div>
                  </div>
                </button>

                {/* Check-Out card */}
                <button
                  className="personnel-dashboard-check-card checkout"
                  type="button"
                  disabled={attendanceBusy === "check_out"}
                  onClick={() => handleAttendance("check_out")}
                >
                  <div className="personnel-dashboard-check-icon">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                      <circle cx="8" cy="15" r="1" fill="currentColor"/>
                      <circle cx="12" cy="15" r="1" fill="currentColor"/>
                      <circle cx="16" cy="15" r="1" fill="currentColor"/>
                    </svg>
                  </div>
                  <div className="personnel-dashboard-check-info">
                    <span className="personnel-dashboard-check-label">CHECK-OUT</span>
                    <div className="personnel-dashboard-check-meta">
                      <div className="personnel-dashboard-check-meta-row">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/>
                          <line x1="8" y1="2" x2="8" y2="6"/>
                          <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        {attendanceToday?.check_out_time
                          ? new Date(attendanceToday.check_out_time).toLocaleDateString("fr-FR")
                          : "--/--/----"}
                      </div>
                      <div className="personnel-dashboard-check-meta-row">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        {effectiveCheckOutValue}
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              <div className="personnel-dashboard-location-wrap">
                {attendanceError ? <div className="alert alert-danger py-2 mb-2">{attendanceError}</div> : null}
                {attendanceSuccess ? <div className="alert alert-success py-2 mb-2">{attendanceSuccess}</div> : null}

                <div className="personnel-dashboard-location-card">
                  <div className="personnel-dashboard-location-head">
                    <div className="personnel-dashboard-location-title-row">
                      <h6 className="mb-0">Localisation de pointage</h6>
                      <div className="personnel-dashboard-location-sub">
                        {geofence?.enabled
                          ? `Zone: rayon ${Math.round(geofence.radius_m || 0)}m`
                          : "Zone: non configuree (CHECKIN_GEOFENCE_*)"}{" "}
                        {Number.isFinite(Number.parseFloat(lastPosition?.latitude)) &&
                        Number.isFinite(Number.parseFloat(lastPosition?.longitude))
                          ? `| Votre position: ${Number(lastPosition.latitude).toFixed(5)}, ${Number(lastPosition.longitude).toFixed(5)}`
                          : ""}
                      </div>
                    </div>
                    {Number.isFinite(Number.parseFloat(lastPosition?.latitude)) &&
                    Number.isFinite(Number.parseFloat(lastPosition?.longitude)) ? (
                      <a
                        className="btn btn-light btn-sm"
                        href={`https://www.openstreetmap.org/?mlat=${encodeURIComponent(
                          lastPosition.latitude,
                        )}&mlon=${encodeURIComponent(lastPosition.longitude)}#map=18/${encodeURIComponent(
                          lastPosition.latitude,
                        )}/${encodeURIComponent(lastPosition.longitude)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Voir sur la carte
                      </a>
                    ) : null}
                  </div>

                  <div className="personnel-dashboard-location-map" ref={mapContainerRef}>
                    {typeof window !== "undefined" && !window.L ? (
                      <div className="personnel-dashboard-location-fallback">
                        Carte indisponible (Leaflet non charge).
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="personnel-dashboard-table-grid">
            <div className="personnel-dashboard-table-card">
              <div className="personnel-dashboard-table-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                <h5 style={{ margin: 0 }}>Emplois du Temps</h5>
                <span style={{ color: "#64748b", fontSize: "14px", fontWeight: "600" }}>
                  {displayDate(weekRange.startIso)} - {displayDate(weekRange.endIso)}
                </span>
              </div>

              {currentWeekPlanning.length ? (
                <div className="personnel-dashboard-table-wrap">
                  <table className="personnel-dashboard-table personnel-dashboard-table-planning" style={{ minWidth: "600px" }}>
                    <thead>
                      <tr>
                        <th className="personnel-dashboard-table-planning-label-col"></th>
                        {weekDaysList.map((d) => (
                          <th key={d.iso} style={{ textAlign: "center", textTransform: "capitalize" }}>{d.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="personnel-dashboard-table-planning-row-label">Horaires</td>
                        {weekDaysList.map((d) => {
                          const events = weekPlanningByDay.get(d.iso) || [];
                          return (
                            <td key={d.iso} className="personnel-dashboard-table-planning-time" style={{ textAlign: "center" }}>
                              {events.length
                                ? events.map((row, i) => (
                                    <div key={i}>{shortTime(row.start_time)} - {shortTime(row.end_time)}</div>
                                  ))
                                : <span className="personnel-dashboard-table-planning-muted">--</span>}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="personnel-dashboard-table-planning-row-label">Notes</td>
                        {weekDaysList.map((d) => {
                          const events = weekPlanningByDay.get(d.iso) || [];
                          return (
                            <td key={d.iso} style={{ textAlign: "center" }}>
                              {events.length
                                ? events.map((row, i) => {
                                    const notes = planningNotesText(row?.notes);
                                    return (
                                      <div key={i} className={notes ? "personnel-dashboard-table-planning-notes" : "personnel-dashboard-table-planning-muted"}>
                                        {notes || "--"}
                                      </div>
                                    );
                                  })
                                : <span className="personnel-dashboard-table-planning-muted">--</span>}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="personnel-dashboard-empty">Aucun emploi du temps pour cette semaine.</div>
              )}
            </div>

            <div className="personnel-dashboard-table-card">
              <div className="personnel-dashboard-table-head" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "6px" }}>
                <h5 style={{ margin: 0, lineHeight: 1 }}>Congés</h5>
                <span style={{ color: "#64748b", fontSize: "13px", fontWeight: "600", lineHeight: 1 }}>Congé le plus proche dans la semaine courante</span>
              </div>

              {nearestWeekLeave ? (
                <div className="personnel-dashboard-table-wrap-conge" style={{ overflowX: "visible" }}>
                  <table className="personnel-dashboard-table personnel-dashboard-table-conge" style={{ tableLayout: "auto", width: "100%", minWidth: "100%" }}>
                    <thead>
                      <tr>
                        <th style={{ width: "auto", whiteSpace: "nowrap" }}>Date debut</th>
                        <th style={{ width: "auto", whiteSpace: "nowrap" }}>Date fin</th>
                        <th style={{ width: "auto", whiteSpace: "nowrap", textAlign: "center" }}>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ whiteSpace: "nowrap" }}>{displayDate(nearestWeekLeave.date_debut)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{displayDate(nearestWeekLeave.date_fin)}</td>
                        <td style={{ whiteSpace: "nowrap", textAlign: "center" }}>
                          <span className={`personnel-dashboard-status-chip tone-${leaveStatusTone(nearestWeekLeave.statut)}`} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
                            {leaveStatusLabel(nearestWeekLeave.statut)}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="personnel-dashboard-empty">Aucun conge sur cette semaine.</div>
              )}
            </div>
          </section>
          </div>
        </div>

        <aside className="admin-bi-sidebar">
          <div className="filters-card">
            <div className="admin-bi-panel-head">
              <h5>Resume du mois</h5>
              <span>{currentMonthTitle}</span>
            </div>

            <div className="personnel-dashboard-summary-grid">
              <div className="personnel-dashboard-summary-card">
                <span>Jours planifies</span>
                <strong>{monthSummaryMetrics.planned_days ?? 0}</strong>
              </div>
              <div className="personnel-dashboard-summary-card">
                <span>Jours travailles</span>
                <strong>{monthSummaryMetrics.worked_days ?? 0}</strong>
              </div>
              <div className="personnel-dashboard-summary-card">
                <span>Heures manquantes</span>
                <strong>{formatHours(monthPayrollFiche?.heures_manquantes)}</strong>
              </div>
              <div className="personnel-dashboard-summary-card">
                <span>Heures supp</span>
                <strong>{formatHours(monthPayrollFiche?.total_heures_supp)}</strong>
              </div>
            </div>

            <div style={{ marginTop: "16px" }}>
              <div className="personnel-dashboard-table-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "10px" }}>
                <h5 style={{ margin: 0, fontSize: "15px" }}>Retards recents</h5>
                <span style={{ color: "#64748b", fontSize: "13px", fontWeight: "600" }}>
                  {monthLateItems.length} jour(s)
                </span>
              </div>

              {monthLateItems.length ? (
                <div className="personnel-dashboard-history-list" style={{ maxHeight: "320px", overflow: "auto" }}>
                  {monthLateItems.slice(0, 6).map((item) => (
                    <div className="personnel-dashboard-history-row" key={`${item.date}-${item.check_in_time}`}>
                      <div className="personnel-dashboard-history-dot" />
                      <div className="personnel-dashboard-history-date">{displayDate(item.date)}</div>
                      <div className="personnel-dashboard-history-text">
                        {item.check_in_time} au lieu de {item.planned_start}
                      </div>
                      <span className="personnel-dashboard-history-badge">
                        +{Math.round(Number(item.delay_minutes) || 0)} min
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="personnel-dashboard-empty">Aucun retard detecte ce mois.</div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <PersonnelProfileEditModal
        open={editOpen}
        onClose={() => {
          if (editSaving) return;
          setEditOpen(false);
          setEditError("");
        }}
        onSubmit={handleProfileSubmit}
        saving={editSaving}
        error={editError}
        profile={personnel}
      />

      {fichePaieOpen && (
        <div className="modal-backdrop-soft" role="dialog" aria-modal="true" onClick={() => setFichePaieOpen(false)}>
          <div
            className="modal-card service-edit-compact"
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: "920px", width: "96%", maxHeight: "90vh", padding: 0 }}
          >
            <button className="modal-close" onClick={() => setFichePaieOpen(false)} aria-label="Fermer">
              {"\u00D7"}
            </button>

            <div className="service-edit-header">
              <span className="service-edit-icon" aria-hidden="true" />
              <div>
                <div className="service-edit-title">Fiche de paie</div>
                <div className="service-edit-subtitle" style={{ fontSize: "13px", color: "#64748b", marginTop: "2px", fontWeight: "600" }}>Heures supp + deductions (salaire net)</div>
              </div>
            </div>

            <div className="service-edit-body modal-body-scroll" style={{ padding: "24px 28px 28px" }}>
              <div className="fp-no-print" style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "end", justifyContent: "space-between", marginBottom: "14px" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "end" }}>
                <div>
                  <label className="form-label" style={{ color: "#8a99b5" }}>Mois</label>
                  <div className="emplois-select" ref={ficheMonthDropdownRef} style={{ minWidth: "220px" }}>
                    <button
                      type="button"
                      className={`form-select emplois-select-trigger ${ficheMonthDropdownOpen ? "open" : ""}`}
                      onClick={() => setFicheMonthDropdownOpen((prev) => !prev)}
                      aria-expanded={ficheMonthDropdownOpen}
                    >
                      <span>{Number(ficheMois)} - {monthLabel(Number(ficheMois))}</span>
                      <span className="emplois-select-caret" aria-hidden="true" />
                    </button>
                    {ficheMonthDropdownOpen ? (
                      <div className="emplois-select-menu" role="listbox">
                        {Array.from({ length: 12 }).map((_, idx) => {
                          const m = idx + 1;
                          const active = Number(ficheMois) === m;
                          return (
                            <button
                              key={m}
                              type="button"
                              className={`emplois-select-option ${active ? "active" : ""}`}
                              onClick={() => {
                                setFicheMonthDropdownOpen(false);
                                if (!active) handleFicheMonthChange(m);
                              }}
                              role="option"
                              aria-selected={active}
                            >
                              {m} - {monthLabel(m)}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div>
                  <label className="form-label" style={{ color: "#8a99b5" }}>Annee</label>
                  <input
                    type="number"
                    className="form-control"
                    value={ficheAnnee}
                    onChange={(e) => handleFicheYearChange(e.target.value)}
                    min="1900"
                    max="2200"
                    style={{ width: "140px" }}
                  />
                </div>
              </div>
              {/**hedhy eli na3mlo biha imprimer**/}
              <button 
                type="button" 
                className="btn admin-accent-btn" 
                onClick={handlePrintFiche}
                disabled={!canPrintFiche}
                style={{ height: "38px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                title={!canPrintFiche ? "Aucune fiche disponible pour cette periode." : undefined}
              >
                <ion-icon name="print-outline"></ion-icon>
                Imprimer / PDF
              </button>
            </div>

            {ficheError ? <div className="alert alert-danger py-2 mb-3">{ficheError}</div> : null}

            {ficheLoading ? (
              <div className="personnel-dashboard-empty">Chargement...</div>
            ) : (() => {
              if (ficheAvailability.blocked) {
                return (
                  <div className="personnel-dashboard-empty" style={{ fontSize: "16px", color: "#64748b", padding: "40px" }}>
                    {ficheAvailability.message}
                  </div>
                );
              }

              if (ficheData?.fiche) {
                return (
                  <>
                <style>{`
                  @media print {
                    @page { margin: 0 !important; }
                    html, body { margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; background: #fff !important; }
                    .personnel-shell .admin-sidebar { display: none !important; }
                    .personnel-shell .admin-main { padding: 0 !important; margin: 0 !important; width: 100% !important; }
                    .personnel-shell .admin-main > :not(.admin-card.personnel-dashboard-prototype) { display: none !important; }
                    .admin-card.personnel-dashboard-prototype { padding: 0 !important; margin: 0 !important; border: none !important; box-shadow: none !important; background: #fff !important; }
                    .admin-card.personnel-dashboard-prototype > :not(.modal-backdrop-soft) { display: none !important; }
                    .modal-backdrop-soft { position: static !important; inset: auto !important; display: block !important; align-items: flex-start !important; justify-content: flex-start !important; background: transparent !important; backdrop-filter: none !important; padding: 0 !important; margin: 0 !important; min-height: auto !important; }
                    .modal-card { position: static !important; width: 100% !important; max-width: none !important; max-height: none !important; height: auto !important; overflow: visible !important; transform: none !important; padding: 0 !important; margin: 0 !important; border: none !important; box-shadow: none !important; background: transparent !important; }
                    .fp-formal { position: static !important; left: auto !important; top: auto !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; border: none !important; }
                    .service-edit-body.modal-body-scroll { padding: 0 !important; margin: 0 !important; overflow: visible !important; max-height: none !important; }
                    .fp-no-print, .modal-close, .service-edit-header { display: none !important; }
                    .fp-grid { display: block !important; margin-bottom: 10px !important; }
                    .fp-grid > .fp-box { margin-bottom: 10px !important; }
                    .fp-tables { display: block !important; }
                    .fp-table-wrap { display: block !important; width: 100% !important; }
                    .fp-table-wrap:last-child { border-left: none !important; margin-top: 8px !important; }
                    .fp-grid, .fp-tables, .fp-box, .fp-table-wrap { page-break-inside: auto !important; break-inside: auto !important; }
                    .fp-header, .fp-totals, .fp-net { page-break-inside: auto !important; break-inside: auto !important; }
                  }
                  .fp-formal { font-family: Arial, sans-serif; color: #1a202c; background: #fff; padding: 10mm; border: 1px solid #cbd5e1; font-size: 13px; line-height: 1.4; max-width: 900px; margin: 0 auto; }
                  .fp-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; flex-wrap: wrap; gap: 20px; border-bottom: 2px solid #1e3a8a; padding-bottom: 15px; }
                  .fp-title-box { text-align: left; flex: 1; min-width: 200px; }
                  .fp-title-box h2 { color: #1e3a8a; font-size: 32px; font-weight: 900; margin: 0 0 5px 0; letter-spacing: 1px; }
                  .fp-periode { color: #64748b; font-weight: bold; font-size: 16px; }
                  .fp-meta { border: 1px solid #cbd5e1; padding: 12px; border-radius: 4px; width: 280px; background: #f8fafc; }
                  .fp-meta-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
                  .fp-meta-row span:first-child { font-weight: bold; }
                  .fp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
                  .fp-box { border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; }
                  .fp-box-title { background: #f1f5f9; color: #1e3a8a; padding: 6px 10px; font-weight: bold; font-size: 13px; border-bottom: 1px solid #cbd5e1; text-transform: uppercase; }
                  .fp-box-content { padding: 10px; display: grid; grid-template-columns: 140px 1fr; gap: 6px 10px; }
                  .fp-box-content strong { color: #0f172a; }
                  .fp-tables { display: flex; border: 1px solid #cbd5e1; margin-bottom: 10px; }
                  .fp-table-wrap { flex: 1; display: flex; flex-direction: column; }
                  .fp-table-wrap:last-child { border-left: 1px solid #cbd5e1; }
                  .fp-table { width: 100%; border-collapse: collapse; height: 100%; }
                  .fp-table th, .fp-table td { padding: 8px 10px; text-align: left; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
                  .fp-table th { background: #f1f5f9; color: #1e3a8a; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; }
                  .fp-table td.num { text-align: right; }
                  .fp-table th.num { text-align: right; }
                  .fp-totals { display: flex; border: 1px solid #cbd5e1; background: #f1f5f9; font-weight: bold; color: #1e3a8a; margin-bottom: 15px; }
                  .fp-totals > div { flex: 1; padding: 10px; display: flex; justify-content: space-between; }
                  .fp-totals > div:last-child { border-left: 1px solid #cbd5e1; }
                  .fp-net { background: #1e3a8a; color: #fff; display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; font-size: 16px; font-weight: bold; border-radius: 4px; }
                `}</style>

                <div className="fp-formal">
                  <div className="fp-header">
                    <div className="fp-title-box">
                      <h2>FICHE DE PAIE</h2>
                      <div className="fp-periode">PÉRIODE : {monthLabel(ficheData.fiche.mois).toUpperCase()} {ficheData.fiche.annee}</div>
                    </div>
                    <div className="fp-meta">
                      <div className="fp-meta-row"><span>N° FICHE :</span> <span>{ficheData.fiche.id || "--"}</span></div>
                      <div className="fp-meta-row"><span>DATE D'ÉDITION :</span> <span>{new Date().toLocaleDateString("fr-FR")}</span></div>
                      <div className="fp-meta-row"><span>MOIS PAYÉ :</span> <span>{monthLabel(ficheData.fiche.mois).toUpperCase()} {ficheData.fiche.annee}</span></div>
                      <div className="fp-meta-row" style={{ marginTop: "8px" }}><span>NB HEURES TRAVAILLÉES :</span> <span>{Number(ficheData.fiche.heures_travaillees || 0).toFixed(2)}</span></div>
                    </div>
                  </div>

                  <div className="fp-grid">
                    <div className="fp-box">
                      <div className="fp-box-title">EMPLOYÉ</div>
                      <div className="fp-box-content">
                        <span>MATRICULE :</span> <strong>{personnel?.matricule || "--"}</strong>
                        <span>NOM ET PRÉNOM :</span> <strong>{personnel?.nom} {personnel?.prenom}</strong>
                        <span>CIN :</span> <strong>{personnel?.cin || "--"}</strong>
                        <span>POSTE :</span> <strong>{personnel?.grade || "--"}</strong>
                        <span>DÉPARTEMENT :</span> <strong>{personnel?.service || "--"}</strong>
                        <span>DATE D'EMBAUCHE :</span> <strong>{personnel?.date_embauche ? displayDate(personnel.date_embauche) : "--"}</strong>
                      </div>
                    </div>
                    <div className="fp-box" style={{ border: "none" }}>
                      <div className="fp-box" style={{ marginBottom: "15px" }}>
                        <div className="fp-box-title">ÉLÉMENTS DE BASE</div>
                        <div className="fp-box-content">
                          <span>SALAIRE DE BASE :</span> <strong>{toMoney(ficheData.fiche.salaire_base)}</strong>
                          <span>TAUX HORAIRE :</span> <strong>{toMoney(ficheData.fiche.taux_horaire)}</strong>
                          <span>COEFFICIENT :</span> <strong>1.00</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="fp-tables">
                    <div className="fp-table-wrap">
                      <table className="fp-table">
                        <thead>
                          <tr>
                            <th>RUBRIQUES</th>
                            <th className="num">BASE / NBR</th>
                            <th className="num">TAUX</th>
                            <th className="num">GAINS</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Salaire de base</td>
                            <td className="num">{Number(ficheData.fiche.heures_prevues || 0).toFixed(2)}</td>
                            <td className="num">{toMoney(ficheData.fiche.taux_horaire).replace(" DT", "")}</td>
                            <td className="num" style={{ fontWeight: "bold" }}>{toMoney(ficheData.fiche.salaire_base).replace(" DT", "")}</td>
                          </tr>
                          {Array.isArray(ficheData?.heures_supp) && ficheData.heures_supp.map((row) => {
                            const tauxCoeff = (Number(ficheData.fiche.taux_horaire) || 0) * (Number(row.coefficient) || 1);
                            return (
                              <tr key={row.id || `${row.date}-${row.type_shift}`}>
                                <td>Heures supp. ({displayDate(row.date)})</td>
                                <td className="num">{Number(row.heures || 0).toFixed(2)}</td>
                                <td className="num">{toMoney(tauxCoeff).replace(" DT", "")}</td>
                                <td className="num" style={{ fontWeight: "bold" }}>{toMoney(row.gain).replace(" DT", "")}</td>
                              </tr>
                            );
                          })}
                          <tr><td colSpan="4" style={{ borderBottom: "none", height: "40px" }}></td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="fp-table-wrap">
                      <table className="fp-table">
                        <thead>
                          <tr>
                            <th>RUBRIQUES</th>
                            <th className="num">RETENUES</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Absences ({Number(ficheData.fiche.heures_manquantes || 0).toFixed(2)} h)</td>
                            <td className="num" style={{ fontWeight: "bold" }}>{toMoney(ficheData.fiche.deductions).replace(" DT", "")}</td>
                          </tr>
                          <tr><td colSpan="2" style={{ borderBottom: "none", height: "40px" }}></td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="fp-totals">
                    <div>
                      <span>TOTAL GAINS</span>
                      <span>{toMoney(Number(ficheData.fiche.salaire_base || 0) + Number(ficheData.fiche.total_gain_supp || 0))}</span>
                    </div>
                    <div>
                      <span>TOTAL RETENUES</span>
                      <span>{toMoney(ficheData.fiche.deductions)}</span>
                    </div>
                  </div>

                  <div className="fp-net">
                    <span>SALAIRE NET À PAYER</span>
                    <span>{toMoney(ficheData.fiche.salaire_net)}</span>
                  </div>
                </div>
              </>
                );
              }

              return <div className="personnel-dashboard-empty">Aucune fiche de paie disponible pour cette periode.</div>;
            })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
