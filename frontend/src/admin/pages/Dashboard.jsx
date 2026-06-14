import { useCallback, useEffect, useMemo, useState } from "react";
import "../../admin/admin.css";
import PersonnelByGradeChart from "../components/PersonnelByGradeChart";
import LeaveEvolutionByMonthChart from "../components/LeaveEvolutionByMonthChart";
import AbsenteeismByServiceChart from "../components/AbsenteeismByServiceChart";
import WorkloadByServiceChart from "../components/WorkloadByServiceChart";
import BIFiltersPanel from "../components/BIFiltersPanel";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : "http://localhost:5000");

const getAuthHeaders = () => {
  try {
    const token = localStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  } catch {
    return undefined;
  }
};

const normalizeText = (value = "") =>
  value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const toLocalISODate = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeISODate = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : value.trim().slice(0, 10);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return toLocalISODate(d);
};

const parseTimeToMinutes = (value) => {
  const raw = String(value || "").slice(0, 5);
  const [h, m] = raw.split(":").map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

const parseDateToMinutes = (value) => {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getHours() * 60 + dt.getMinutes();
};
//t7awalll lilfaormat hathii HH:MM (14:05)
const formatClock = (value) => {
  if (!value) return "--:--";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "--:--";
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
};

const formatMonthLabel = (monthKey) => {
  if (!monthKey || monthKey.length < 7) return "--";
  const month = monthKey.slice(5, 7);
  const year = monthKey.slice(2, 4);
  return `${month}/${year}`;
};

const isCongeType = (value) => normalizeText(value) === "conge";

const normalizeShiftLabel = (value = "") => {
  const raw = (value || "").toString().trim();
  if (!raw) return "";
  const key = normalizeText(raw);
  if (key.includes("apres")) return "Apres-midi";
  if (key.includes("garde")) return "Garde";
  if (key.includes("matin")) return "Matin";
  return raw;
};

const normalizeLeaveStatusKey = (value = "") => {
  const key = normalizeText(value);
  if (key.startsWith("approuv")) return "approved";
  if (key.startsWith("refus")) return "refused";
  if (key.startsWith("annul")) return "canceled";
  return "pending";
};

const normalizeContractKey = (value = "") => {
  const key = normalizeText(value);
  if (key.includes("cdd")) return "cdd";
  if (key.includes("cdi")) return "cdi";
  if (key.includes("stag")) return "stage";
  return "";
};

const isApprovedStatus = (value = "") => normalizeLeaveStatusKey(value) === "approved";

const rangesOverlapIso = (startIso, endIso, dayIso) => {
  if (!startIso || !endIso || !dayIso) return false;
  return startIso <= dayIso && endIso >= dayIso;
};

const getRowServiceId = (row = {}) =>
  row?.id_service ?? row?.service_id ?? row?.idService ?? row?.serviceId ?? null;

const getRowServiceName = (row = {}) =>
  (row?.service || row?.service_text || row?.serviceName || row?.nom_service || "").toString().trim();
//fonction pour les 6 derniers mois
const lastNMonths = (n = 6, now = new Date()) => {
  const out = [];
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
};

const monthRangeIso = (monthKey) => {
  if (!monthKey || monthKey.length < 7) return { startIso: "", endIso: "" };
  const year = Number.parseInt(monthKey.slice(0, 4), 10);
  const month = Number.parseInt(monthKey.slice(5, 7), 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return { startIso: "", endIso: "" };
  }

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { startIso: toLocalISODate(start), endIso: toLocalISODate(end) };
};
//fonction pour les 30 derniers jours
const lastNDatesIso = (n = 30, now = new Date()) => {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(toLocalISODate(d));
  }
  return out;
};

export default function DashboardPage() {
  const [services, setServices] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [planning, setPlanning] = useState([]);
  const [conges, setConges] = useState([]);
  const [attendanceSummaries, setAttendanceSummaries] = useState([]);
  const [recentAttendanceEvents, setRecentAttendanceEvents] = useState([]);
  const [attendanceDailyCheckins, setAttendanceDailyCheckins] = useState([]);
  const [serviceFilter, setServiceFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("30");
  const [contractFilter, setContractFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  //extraction des donnees
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    setWarnings([]);
    const authHeaders = getAuthHeaders();

    const fetchJSON = async (url, options = undefined) => {
      const resp = await fetch(url, options);
      const json = await resp.json().catch(() => null);
      return { ok: resp.ok, status: resp.status, data: json, message: json?.message };
    };

    try {
      const [
        servicesSettled,
        personnelSettled,
        planningSettled,
        congesSettled,
        attendanceSettled,
      ] = await Promise.allSettled([
        fetchJSON(`${API_BASE_URL}/api/services`),
        fetchJSON(`${API_BASE_URL}/api/personnel`),
        fetchJSON(`${API_BASE_URL}/api/planning`, { headers: authHeaders }),
        fetchJSON(`${API_BASE_URL}/api/conges/admin`, { headers: authHeaders }),
        fetchJSON(`${API_BASE_URL}/api/attendance/admin/today`, { headers: authHeaders }),
      ]);

      const servicesRes =
        servicesSettled.status === "fulfilled"
          ? servicesSettled.value
          : { ok: false, status: 0, data: [] };
      const personnelRes =
        personnelSettled.status === "fulfilled"
          ? personnelSettled.value
          : { ok: false, status: 0, data: [] };
      const planningRes =
        planningSettled.status === "fulfilled"
          ? planningSettled.value
          : { ok: false, status: 0, data: [] };
      const congesRes =
        congesSettled.status === "fulfilled"
          ? congesSettled.value
          : { ok: false, status: 0, data: [] };
      const attendanceRes =
        attendanceSettled.status === "fulfilled"
          ? attendanceSettled.value
          : { ok: false, status: 0, data: null };

      setServices(Array.isArray(servicesRes.data) ? servicesRes.data : []);
      setPersonnel(Array.isArray(personnelRes.data) ? personnelRes.data : []);
      setPlanning(Array.isArray(planningRes.data) ? planningRes.data : []);
      setConges(Array.isArray(congesRes.data) ? congesRes.data : []);
      setAttendanceSummaries(
        Array.isArray(attendanceRes?.data?.summaries) ? attendanceRes.data.summaries : []
      );
      setRecentAttendanceEvents(
        Array.isArray(attendanceRes?.data?.recent_events) ? attendanceRes.data.recent_events : []
      );
      setAttendanceDailyCheckins(
        Array.isArray(attendanceRes?.data?.daily_checkins) ? attendanceRes.data.daily_checkins : []
      );

      const nextWarnings = [];
      if (!servicesRes.ok) nextWarnings.push("Services: chargement incomplet.");
      if (!personnelRes.ok) nextWarnings.push("Personnel: chargement incomplet.");
      if (!planningRes.ok) nextWarnings.push("Planning: chargement incomplet.");
      if (!congesRes.ok) nextWarnings.push("Conges: chargement incomplet.");
      if (!attendanceRes.ok) nextWarnings.push("Presence live: chargement incomplet.");
      setWarnings(nextWarnings);
    } catch (e) {
      setError(e?.message || "Erreur serveur.");
      setTimeout(() => setError(""), 4000);
      setServices([]);
      setPersonnel([]);
      setPlanning([]);
      setConges([]);
      setAttendanceSummaries([]);
      setRecentAttendanceEvents([]);
      setAttendanceDailyCheckins([]);
      setWarnings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);
//transformation
  const serviceIdToName = useMemo(() => {
    const map = new Map();
    (Array.isArray(services) ? services : []).forEach((s) => {
      const id = s?.id;
      const name = (s?.service || s?.nom || "").toString().trim();
      if (id === null || typeof id === "undefined" || !name) return;
      map.set(String(id), name);
    });
    return map;
  }, [services]);

  const serviceOptions = useMemo(() => {
    const base = [{ id: "all", label: "Tous les services" }];
    const opts = (Array.isArray(services) ? services : [])
      .map((s) => ({
        id: s?.id,
        label: (s?.service || s?.nom || "").toString().trim(),
      }))
      .filter((s) => s.id !== null && typeof s.id !== "undefined" && s.label)
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
    return [...base, ...opts.map((o) => ({ id: String(o.id), label: o.label }))];
  }, [services]);

  const activeServiceLabel = useMemo(() => {
    return serviceOptions.find((opt) => String(opt.id) === String(serviceFilter))?.label || "Tous les services";
  }, [serviceFilter, serviceOptions]);

  const contractOptions = useMemo(() => {
    return [
      { id: "all", label: "Tous les contrats" },
      { id: "cdd", label: "CDD" },
      { id: "cdi", label: "CDI" },
      { id: "stage", label: "Stage" },
    ];
  }, []);

  const matchesFilters = useCallback(
    (row) => {
      // Service filter
      if (serviceFilter !== "all") {
        const wantedService = serviceFilter;
        const rowServiceId = getRowServiceId(row);
        let serviceMatch = false;
        if (rowServiceId !== null && typeof rowServiceId !== "undefined" && String(rowServiceId) === wantedService) {
          serviceMatch = true;
        } else {
          const wantedName = serviceIdToName.get(wantedService) || "";
          const rowName = getRowServiceName(row);
          if (wantedName && rowName && normalizeText(rowName) === normalizeText(wantedName)) {
            serviceMatch = true;
          }
        }
        if (!serviceMatch) return false;
      }

      // Contract filter
      if (contractFilter !== "all") {
        const rowContract = (row?.type_contrat || row?.contrat || row?.type_contract || "").toString();
        if (normalizeContractKey(rowContract) !== contractFilter) {
          return false;
        }
      }

      return true;
    },
    [serviceFilter, contractFilter, serviceIdToName]
  );

  const filteredPersonnel = useMemo(() => personnel.filter(matchesFilters), [personnel, matchesFilters]);
  const filteredPlanning = useMemo(() => planning.filter(matchesFilters), [planning, matchesFilters]);
  const filteredConges = useMemo(() => conges.filter(matchesFilters), [conges, matchesFilters]);

  const todayIso = useMemo(() => toLocalISODate(new Date()), []);

  const personnelByMatricule = useMemo(() => {
    const map = new Map();
    (Array.isArray(personnel) ? personnel : []).forEach((p) => {
      const key = String(p?.matricule || "").trim();
      if (!key) return;
      map.set(key, p);
    });
    return map;
  }, [personnel]);

  const filteredMatricules = useMemo(
    () => new Set(filteredPersonnel.map((p) => String(p?.matricule || "").trim()).filter(Boolean)),
    [filteredPersonnel]
  );

  const filteredAttendanceSummaries = useMemo(
    () =>
      attendanceSummaries.filter((s) =>
        filteredMatricules.has(String(s?.matricule || "").trim())
      ),
    [attendanceSummaries, filteredMatricules]
  );

  const attendanceSummaryByMatricule = useMemo(() => {
    const map = new Map();
    filteredAttendanceSummaries.forEach((row) => {
      const key = String(row?.matricule || "").trim();
      if (!key) return;
      map.set(key, row);
    });
    return map;
  }, [filteredAttendanceSummaries]);
  //card
  const totalPersonnel = filteredPersonnel.length;

  const checkedInTodaySet = useMemo(() => {
    const set = new Set();
    filteredAttendanceSummaries.forEach((row) => {
      const matricule = String(row?.matricule || "").trim();
      if (!matricule || !row?.check_in_time) return;
      set.add(matricule);
    });
    return set;
  }, [filteredAttendanceSummaries]);

  const presentTodayCount = checkedInTodaySet.size;

  const onLeaveTodaySet = useMemo(() => {
    const set = new Set();
    filteredConges.forEach((row) => {
      if (!isApprovedStatus(row?.statut || "")) return;
      const startIso = normalizeISODate(row?.date_debut);
      const endIso = normalizeISODate(row?.date_fin);
      const matricule = String(row?.matricule || "").trim();
      if (!matricule || !startIso || !endIso) return;
      if (rangesOverlapIso(startIso, endIso, todayIso)) set.add(matricule);
    });
    return set;
  }, [filteredConges, todayIso]);

  const onLeaveTodayCount = onLeaveTodaySet.size;
  const absentTodayCount = Math.max(totalPersonnel - presentTodayCount - onLeaveTodayCount, 0);

  const lateCheckinCount = useMemo(() => {
    const plannedStartByMatricule = new Map();
    filteredPlanning.forEach((row) => {
      if (!row) return;
      if (normalizeISODate(row?.date) !== todayIso) return;
      if (isCongeType(row?.type || "")) return;
      const matricule = String(row?.matricule || "").trim();
      if (!matricule) return;
      const startMinutes = parseTimeToMinutes(row?.start_time || row?.heure_debut || "");
      if (startMinutes === null) return;
      const current = plannedStartByMatricule.get(matricule);
      if (current === undefined || startMinutes < current) {
        plannedStartByMatricule.set(matricule, startMinutes);
      }
    });

    let count = 0;
    checkedInTodaySet.forEach((matricule) => {
      const planned = plannedStartByMatricule.get(matricule);
      if (planned === undefined) return;
      const checkin = attendanceSummaryByMatricule.get(matricule)?.check_in_time;
      const checkinMinutes = parseDateToMinutes(checkin);
      if (checkinMinutes === null) return;
      if (checkinMinutes > planned + 15) count += 1;
    });

    return count;
  }, [filteredPlanning, todayIso, checkedInTodaySet, attendanceSummaryByMatricule]);
  //chargement
  const personnelByGradeData = useMemo(() => {
    const counts = new Map();
    filteredPersonnel.forEach((p) => {
      const grade = (p?.grade || p?.role || "--").toString().trim() || "--";
      counts.set(grade, (counts.get(grade) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => b.count - a.count || a.grade.localeCompare(b.grade, "fr"));
  }, [filteredPersonnel]);

  const absenteeismByServiceData = useMemo(() => {
    const days = parseInt(periodFilter, 10) || 30;
    const lastN = lastNDatesIso(days, new Date());
    
    const checkinsByMatricule = new Map();
    attendanceDailyCheckins.forEach((row) => {
      const key = normalizeISODate(row?.date);
      if (!lastN.includes(key)) return;
      const list = Array.isArray(row?.matricules) ? row.matricules : [];
      list.forEach((m) => {
        const mat = String(m || "").trim();
        if (mat) {
          checkinsByMatricule.set(mat, (checkinsByMatricule.get(mat) || 0) + 1);
        }
      });
    });

    const statsByService = new Map();
    serviceOptions.forEach(opt => {
      if (opt.id !== "all") {
        statsByService.set(opt.label, { service: opt.label, personnelCount: 0, actualCheckins: 0 });
      }
    });

    filteredPersonnel.forEach(p => {
      const serviceName = serviceIdToName.get(String(p?.id_service ?? p?.service_id ?? p?.idService ?? p?.serviceId)) || p?.service || p?.service_text || "Autre";
      const normalizedName = serviceOptions.find(o => o.id !== "all" && normalizeText(o.label) === normalizeText(serviceName))?.label || serviceName;
      
      let stat = statsByService.get(normalizedName);
      if (!stat) {
        stat = { service: normalizedName, personnelCount: 0, actualCheckins: 0 };
        statsByService.set(normalizedName, stat);
      }
      
      stat.personnelCount += 1;
      const mat = String(p.matricule || "").trim();
      stat.actualCheckins += (checkinsByMatricule.get(mat) || 0);
    });

    return Array.from(statsByService.values())
      .filter(s => s.personnelCount > 0)
      .map(s => {
        //Supposer environ 5 jours ouvrables par semaine
        const expectedCheckins = s.personnelCount * Math.floor(days * (5/7));//nombre de checkins attendus pour le service sur la période
        const rate = expectedCheckins > 0 ? ((expectedCheckins - s.actualCheckins) / expectedCheckins) * 100 : 0;//poucentage d'absence
        return {
          service: s.service,
          rate: Math.max(0, Number(rate.toFixed(1))),
        };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [attendanceDailyCheckins, filteredPersonnel, serviceOptions, serviceIdToName, periodFilter]);
  
  const workloadByServiceData = useMemo(() => {
    const days = parseInt(periodFilter, 10) || 30;
    const lastN = lastNDatesIso(days, new Date());
    const statsByService = new Map();
    
    filteredPlanning.forEach(row => {
      if (!row || isCongeType(row.type || "")) return;
      const dateIso = normalizeISODate(row?.date);
      if (!lastN.includes(dateIso)) return;

      const mat = String(row.matricule || "").trim();
      if (!mat) return;
      const p = personnelByMatricule.get(mat);
      if (!p) return;

      const serviceName = serviceIdToName.get(String(p?.id_service ?? p?.service_id ?? p?.idService ?? p?.serviceId)) || p?.service || p?.service_text || "Autre";
      const normalizedName = serviceOptions.find(o => o.id !== "all" && normalizeText(o.label) === normalizeText(serviceName))?.label || serviceName;

      let stat = statsByService.get(normalizedName);
      if (!stat) {
        stat = { service: normalizedName, normalHours: 0, gardeHours: 0 };
        statsByService.set(normalizedName, stat);
      }

      const startMin = parseTimeToMinutes(row.start_time || row.heure_debut || "");
      const endMin = parseTimeToMinutes(row.end_time || row.heure_fin || "");
      if (startMin === null || endMin === null) return;
      
      let durationMin = endMin - startMin;
      if (durationMin < 0) durationMin += 24 * 60;//kanshift grade duration tkon negative donc namloo l'operation haki bach twali positive

      const typeLabel = normalizeShiftLabel(row.type);
      if (typeLabel === "Garde") {
        stat.gardeHours += durationMin / 60;
      } else {
        stat.normalHours += durationMin / 60;
      }
    });

    return Array.from(statsByService.values())
      .filter(s => s.normalHours > 0 || s.gardeHours > 0)
      .map(s => ({
        service: s.service,
        normalHours: Number(s.normalHours.toFixed(0)),
        gardeHours: Number(s.gardeHours.toFixed(0))
      }))
      .sort((a, b) => (b.normalHours + b.gardeHours) - (a.normalHours + a.gardeHours));

  }, [filteredPlanning, personnelByMatricule, serviceOptions, serviceIdToName, periodFilter]);

  const workloadChartHeight = useMemo(
    () => Math.max(200, workloadByServiceData.length * 24 + 72),
    [workloadByServiceData.length]
  );

  const leaveEvolutionByMonthData = useMemo(() => {
    const months = lastNMonths(6, new Date());

    const seed = new Map(
      months.map((m) => [
        m,
        { month: m, month_label: formatMonthLabel(m), approved: 0, pending: 0, refused: 0, canceled: 0 },
      ])
    );

    filteredConges.forEach((row) => {
      const startIso = normalizeISODate(row?.date_debut);
      const endIso = normalizeISODate(row?.date_fin) || startIso;
      if (!startIso || !endIso) return;

      const statusKey = normalizeLeaveStatusKey(row?.statut || "");

      months.forEach((monthKey) => {
        const { startIso: monthStartIso, endIso: monthEndIso } = monthRangeIso(monthKey);
        if (!monthStartIso || !monthEndIso) return;
        if (startIso > monthEndIso || endIso < monthStartIso) return;

        const bucket = seed.get(monthKey);
        if (!bucket) return;
        if (statusKey === "approved") bucket.approved += 1;
        else if (statusKey === "refused") bucket.refused += 1;
        else if (statusKey === "canceled") bucket.canceled += 1;
        else bucket.pending += 1;
      });
    });

    return months.map((m) => seed.get(m));
  }, [filteredConges]);

  const presentNowItems = useMemo(() => {
    const out = [];
    filteredAttendanceSummaries.forEach((row) => {
      if (!row?.check_in_time) return;
      const lastType = String(row?.last_event_type || "").trim().toLowerCase();
      if (lastType !== "check_in") return;
      const matricule = String(row?.matricule || "").trim();
      if (!matricule) return;
      const person = personnelByMatricule.get(matricule);
      out.push({
        matricule,
        name: person?.name || `${person?.prenom || ""} ${person?.nom || ""}`.trim() || matricule,
        service: person?.service || "",
        checkIn: row?.check_in_time,
      });
    });
    return out.sort((a, b) => String(b.checkIn || "").localeCompare(String(a.checkIn || "")));
  }, [filteredAttendanceSummaries, personnelByMatricule]);

  const absentTodayItems = useMemo(() => {
    return filteredPersonnel
      .map((p) => {
        const matricule = String(p?.matricule || "").trim();
        if (!matricule) return null;
        if (checkedInTodaySet.has(matricule)) return null;
        return {
          matricule,
          name: p?.name || `${p?.prenom || ""} ${p?.nom || ""}`.trim() || matricule,
          service: p?.service || "",
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [filteredPersonnel, checkedInTodaySet]);

  const recentAttendanceItems = useMemo(() => {
    return recentAttendanceEvents
      .filter((row) => {
        const matricule = String(row?.matricule || "").trim();
        if (!matricule) return false;
        const person = personnelByMatricule.get(matricule);
        return person ? matchesFilters(person) : false;
      })
      .map((row) => {
        const matricule = String(row?.matricule || "").trim();
        const person = personnelByMatricule.get(matricule);
        const eventType = String(row?.event_type || "").toLowerCase();
        return {
          matricule,
          name: person?.name || `${person?.prenom || ""} ${person?.nom || ""}`.trim() || matricule,
          service: person?.service || "",
          eventType,
          when: row?.recorded_at || null,
        };
      })
      .sort((a, b) => String(b.when || "").localeCompare(String(a.when || "")))
      .slice(0, 14);
  }, [recentAttendanceEvents, personnelByMatricule, matchesFilters]);

  return (
    <div className="admin-card admin-bi">
      <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
        <div className="personnel-page-title-wrap">
          <span className="personnel-page-title-line" aria-hidden="true" />
          <div>
            <h3 className="personnel-page-title mb-1">Tableau de Bord</h3>
          </div>
        </div>
      </div>

      {error ? (
        <div className="alert alert-danger mb-3" role="alert">
          {error}
        </div>
      ) : null}

      {warnings.length ? (
        <div className="alert alert-warning mb-3" role="alert">
          {warnings.join(" ")}
        </div>
      ) : null}

      <div className="row g-3 admin-bi-kpi-row">
        <div className="col-xl-3 col-lg-3 col-md-6">
          <div className="stat-card bg-gradient-primary text-white">
            <div className="stat-title">Total personnel</div>
            <div className="stat-value">{loading ? "--" : totalPersonnel}</div>
            <div className="admin-bi-kpi-sub">{activeServiceLabel}</div>
          </div>
        </div>
        <div className="col-xl-3 col-lg-3 col-md-6">
          <div className="stat-card bg-gradient-success text-white">
            <div className="stat-title">Presents aujourd'hui</div>
            <div className="stat-value">{loading ? "--" : presentTodayCount}</div>
            <div className="admin-bi-kpi-sub">Check-in enregistre le {todayIso}</div>
          </div>
        </div>
        <div className="col-xl-3 col-lg-3 col-md-6">
          <div className="stat-card bg-gradient-orange text-white">
            <div className="stat-title">Retards check-in</div>
            <div className="stat-value">{loading ? "--" : lateCheckinCount}</div>
            <div className="admin-bi-kpi-sub">Arrivee apres debut shift (+15 min)</div>
          </div>
        </div>
        <div className="col-xl-3 col-lg-3 col-md-6">
          <div className="stat-card bg-gradient-teal text-white">
            <div className="stat-title">Absents aujourd'hui</div>
            <div className="stat-value">
              {loading ? "--" : absentTodayCount}
            </div>
            <div className="admin-bi-kpi-sub">
              {loading ? "--" : `Dont ${onLeaveTodayCount} en conge approuve`}
            </div>
          </div>
        </div>
      </div>

      <div className="admin-bi-layout">
        <div className="admin-bi-content">
          <div className="admin-bi-grid mt-3">
            <section className="admin-bi-panel">
              <header className="admin-bi-panel-head">
                <h5>Personnel par grade</h5>
                <span>Repartition dans {activeServiceLabel}</span>
              </header>
              <div className="admin-bi-chart">
                <PersonnelByGradeChart data={personnelByGradeData} height={250} />
              </div>
            </section>

            <section className="admin-bi-panel">
              <header className="admin-bi-panel-head">
                <h5>Absentéisme par service</h5>
                <span>Taux calculé sur les {periodFilter} derniers jours</span>
              </header>
              <div className="admin-bi-chart">
                <AbsenteeismByServiceChart data={absenteeismByServiceData} height={250} />
              </div>
            </section>

            <section className="admin-bi-panel">
              <header className="admin-bi-panel-head">
                <h5>Charge de travail (Heures)</h5>
                <span>Heures Normales vs Garde/Nuit ({periodFilter} j)</span>
              </header>
              <div className="admin-bi-chart">
                <WorkloadByServiceChart data={workloadByServiceData} height={workloadChartHeight} />
              </div>
            </section>

            <section className="admin-bi-panel">
              <header className="admin-bi-panel-head">
                <h5>Evolution des conges (6 mois)</h5>
                <span>Par statut et par mois</span>
              </header>
              <div className="admin-bi-chart">
                <LeaveEvolutionByMonthChart data={leaveEvolutionByMonthData} height={250} />
              </div>
            </section>
          </div>
        </div>

        <aside className="admin-bi-sidebar">
          <div className="filters-card">
            <BIFiltersPanel
              contractOptions={contractOptions}
              contractFilter={contractFilter}
              onContractChange={setContractFilter}
              onContractReset={() => setContractFilter("all")}
              serviceOptions={serviceOptions}
              serviceFilter={serviceFilter}
              onServiceChange={(value) => setServiceFilter(String(value))}
              onServiceReset={() => setServiceFilter("all")}
              periodFilter={periodFilter}
              onPeriodChange={setPeriodFilter}
            />
          </div>
        </aside>
      </div>

      <section className="admin-bi-panel admin-bi-live-panel mt-3">
        <header className="admin-bi-panel-head">
          <h5>Presence en Temps Reel</h5>
          <span>Presence live et derniers mouvements</span>
        </header>

        <div className="admin-bi-live-grid">
          <div className="admin-bi-live-col">
            <div className="admin-bi-live-title">
              Presents maintenant <span className="admin-bi-live-count">{presentNowItems.length}</span>
            </div>
            <div className="admin-bi-live-list">
              {presentNowItems.length ? (
                presentNowItems.slice(0, 10).map((item) => (
                  <div key={`present-${item.matricule}`} className="admin-bi-live-item">
                    <div className="admin-bi-live-main">
                      <div className="admin-bi-live-name">{item.name}</div>
                      <div className="admin-bi-live-meta">
                        {item.service || "Service --"} | Check-in {formatClock(item.checkIn)}
                      </div>
                    </div>
                    <span className="admin-bi-live-pill success">En ligne</span>
                  </div>
                ))
              ) : (
                <div className="text-muted small">Aucun personnel actif actuellement.</div>
              )}
            </div>
          </div>

          <div className="admin-bi-live-col">
            <div className="admin-bi-live-title">
              Absents aujourd'hui <span className="admin-bi-live-count">{absentTodayItems.length}</span>
            </div>
            <div className="admin-bi-live-list">
              {absentTodayItems.length ? (
                absentTodayItems.slice(0, 10).map((item) => (
                  <div key={`absent-${item.matricule}`} className="admin-bi-live-item">
                    <div className="admin-bi-live-main">
                      <div className="admin-bi-live-name">{item.name}</div>
                      <div className="admin-bi-live-meta">{item.service || "Service --"}</div>
                    </div>
                    <span className="admin-bi-live-pill danger">Absent</span>
                  </div>
                ))
              ) : (
                <div className="text-muted small">Aucun absent aujourd'hui.</div>
              )}
            </div>
          </div>

          <div className="admin-bi-live-col">
            <div className="admin-bi-live-title">
              Derniers check-in / check-out
              <span className="admin-bi-live-count">{recentAttendanceItems.length}</span>
            </div>
            <div className="admin-bi-live-list">
              {recentAttendanceItems.length ? (
                recentAttendanceItems.map((item, idx) => (
                  <div key={`event-${item.matricule}-${item.when}-${idx}`} className="admin-bi-live-item">
                    <div className="admin-bi-live-main">
                      <div className="admin-bi-live-name">{item.name}</div>
                      <div className="admin-bi-live-meta">
                        {item.service || "Service --"} | {normalizeISODate(item.when)} {formatClock(item.when)}
                      </div>
                    </div>
                    <span
                      className={`admin-bi-live-pill ${
                        item.eventType === "check_in" ? "success" : "warning"
                      }`}
                    >
                      {item.eventType === "check_in" ? "Check-in" : "Check-out"}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-muted small">Aucun mouvement recent.</div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}