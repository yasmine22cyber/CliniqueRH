const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const planningModel = require("../models/planningModel");
const congesModel = require("../models/congesModel");
const attendanceModel = require("../models/attendanceModel");
const { getPlanningStore } = planningModel;
const { getServiceStore } = require("../models/serviceModel");
const { getTableColumns, getUtilisateurColumns } = require("../models/dbUtils");
const {
  fetchTodaySummary,
  hasTodayEvent,
  insertAttendanceEvent,
  listTodayAttendanceSummary,
  listRecentAttendanceEvents,
  listDailyCheckInsByDate,
} = require("../models/attendanceModel");
const { checkApprovedCongeOverlap } = require("../models/congesModel");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

const extractBearerToken = (req) => {
  const header = req.get?.("authorization") || req.headers?.authorization || "";
  const raw = Array.isArray(header) ? header[0] : String(header || "");
  const match = raw.match(/^\s*Bearer\s+(.+)\s*$/i);
  return match ? match[1] : "";
};

const extractJwtPayload = (req) => {
  const token = extractBearerToken(req);
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

const normalizeMatricule = (value) => (String(value || "").match(/\d/g) || []).join("").slice(0, 10);
const isAdminRole = (role) => String(role || "").toLowerCase().includes("admin");
const parseIntSafe = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number.parseInt(String(value), 10);
  return Number.isInteger(n) ? n : fallback;
};

const currentMonthYear = () => {
  const now = new Date();
  return { mois: now.getMonth() + 1, annee: now.getFullYear() };
};

const resolveMonthYear = (req) => {
  const fallback = currentMonthYear();
  const mois =
    parseIntSafe(req.query?.mois ?? req.query?.month ?? req.body?.mois ?? req.body?.month, fallback.mois) ??
    fallback.mois;
  const annee =
    parseIntSafe(req.query?.annee ?? req.query?.year ?? req.body?.annee ?? req.body?.year, fallback.annee) ??
    fallback.annee;
  return { mois, annee };
};

const toIsoDateOnly = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const parseTimeToMinutes = (value) => {
  const raw = String(value || "").slice(0, 5);
  const [hours, minutes] = raw.split(":").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const parseDateTimeToMinutes = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours() * 60 + date.getMinutes();
};

const expandIsoRange = (startIso, endIso) => {
  if (!startIso) return [];
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${(endIso || startIso)}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const out = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(toIsoDateOnly(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};
//t7aded chkonn user ili3amel request wtistakhrajloo les informations min jwt
const resolveCaller = (req) => {
  const payload = extractJwtPayload(req);
  const jwtMatricule = normalizeMatricule(payload?.matricule || "");
  const jwtRole = String(payload?.role || "").trim();

  return { matricule: jwtMatricule, role: jwtRole };
};

const parseFloatOrNull = (value) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
};

const geofenceConfig = () => {
  const lat = parseFloatOrNull(process.env.CHECKIN_GEOFENCE_LAT);
  const lng = parseFloatOrNull(process.env.CHECKIN_GEOFENCE_LNG);
  const radiusM = parseFloatOrNull(process.env.CHECKIN_GEOFENCE_RADIUS_M);
  const enabled = lat !== null && lng !== null && radiusM !== null && radiusM > 0;
  return { enabled, lat, lng, radiusM };
};

const toRadians = (deg) => (deg * Math.PI) / 180;
//t7seb distance bin 2 points geographiques bil m
const distanceMeters = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;//nos 9oter l'aredh
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = //9adesh no9tin b3ad 3la b3adhhom fou9 lkoura ardhiya 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));//zewya eli bin no9tin
  return R * c;
};

const requireMatricule = (matricule, res) => {
  if (!matricule || matricule.length !== 10) {
    res.status(401).json({ message: "Non autorise: matricule manquant." });
    return false;
  }
  return true;
};

const requireAdmin = (role, res) => {
  if (!isAdminRole(role)) {
    res.status(403).json({ message: "Acces refuse (admin requis)." });
    return false;
  }
  return true;
};

const getGeofence = async (_req, res) => {
  const geo = geofenceConfig();
  return res.json({
    enabled: geo.enabled,
    latitude: geo.enabled ? geo.lat : null,
    longitude: geo.enabled ? geo.lng : null,
    radius_m: geo.enabled ? geo.radiusM : null,
  });
};

const getToday = async (req, res) => {
  try {
    const { matricule } = resolveCaller(req);
    if (!requireMatricule(matricule, res)) return;
    const summary = await fetchTodaySummary(matricule, pool);
    return res.json(summary || { matricule, date: new Date().toISOString().slice(0, 10) });
  } catch (error) {
    console.error("attendance getToday error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const getAdminToday = async (req, res) => {
  try {
    const { role } = resolveCaller(req);
    if (!requireAdmin(role, res)) return;

    const [summaries, recentEvents, dailyCheckins] = await Promise.all([
      listTodayAttendanceSummary(pool),
      listRecentAttendanceEvents({ limit: 40, days: 3 }, pool),
      listDailyCheckInsByDate({ days: 30 }, pool),
    ]);

    return res.json({
      date: new Date().toISOString().slice(0, 10),
      summaries,
      recent_events: recentEvents,
      daily_checkins: dailyCheckins,
    });
  } catch (error) {
    console.error("attendance getAdminToday error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const getMyMonthlySummary = async (req, res) => {
  try {
    const { matricule } = resolveCaller(req);
    if (!requireMatricule(matricule, res)) return;

    const { mois, annee } = resolveMonthYear(req);
    if (!Number.isInteger(mois) || mois < 1 || mois > 12) {
      return res.status(400).json({ message: "Mois invalide (1..12)." });
    }
    if (!Number.isInteger(annee) || annee < 1900 || annee > 2200) {
      return res.status(400).json({ message: "Annee invalide." });
    }

    const monthStart = new Date(annee, mois - 1, 1);
    const monthEnd = new Date(annee, mois, 0);
    const monthStartIso = toIsoDateOnly(monthStart);
    const monthEndIso = toIsoDateOnly(monthEnd);
    const monthLabel = monthStart.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

    const planningStore = await getPlanningStore(pool).catch(() => null);
    const planningCols = planningStore?.table ? await getTableColumns(planningStore.table, pool).catch(() => new Set()) : new Set();
    const planningIdCol = planningCols.has("id") ? "id" : planningCols.has("id_planning") ? "id_planning" : "id";
    const serviceStore = await getServiceStore(pool).catch(() => null);
    const userCols = await getUtilisateurColumns(pool).catch(() => []);

    const [planningRows, workSessions, leaveRows] = await Promise.all([
      planningStore?.table
        ? planningModel.fetchPlanningRows({
          table: planningStore.table,
          planningIdCol,
          planningCols,
          serviceStore,
          userCols,
          matriculeFilter: matricule,
        }, pool)
        : [],
      attendanceModel.listWorkSessionsForMonth({ matricule, mois, annee }, pool),
      congesModel.fetchConges(matricule, pool),
    ]);

    const plannedDays = new Set();
    const plannedStartByDate = new Map();
    const workDays = new Set();

    planningRows.forEach((row) => {
      const dateIso = toIsoDateOnly(row?.date);
      const endIso = toIsoDateOnly(row?.date_fin) || dateIso;
      if (!dateIso) return;
      if (dateIso > monthEndIso || endIso < monthStartIso) return;

      plannedDays.add(dateIso);
      const startMinutes = parseTimeToMinutes(row?.start_time || row?.heure_debut || "");
      if (startMinutes === null) return;

      const current = plannedStartByDate.get(dateIso);
      if (current === undefined || startMinutes < current.minutes) {
        plannedStartByDate.set(dateIso, {
          minutes: startMinutes,
          label: String(row?.start_time || row?.heure_debut || "").slice(0, 5),
        });
      }
    });

    const firstCheckInByDate = new Map();
    workSessions.forEach((session) => {
      const dateIso = toIsoDateOnly(session?.date);
      if (!dateIso || dateIso < monthStartIso || dateIso > monthEndIso) return;
      workDays.add(dateIso);

      const checkInMinutes = parseDateTimeToMinutes(session?.check_in_time);
      if (checkInMinutes === null) return;

      const previous = firstCheckInByDate.get(dateIso);
      if (previous === undefined || checkInMinutes < previous.minutes) {
        firstCheckInByDate.set(dateIso, {
          minutes: checkInMinutes,
          label: new Date(session.check_in_time).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
      }
    });

    const leaveStats = {
      total: 0,
      approved: 0,
      pending: 0,
      refused: 0,
      canceled: 0,
    };
    const approvedLeaveDays = new Set();

    leaveRows.forEach((row) => {
      const startIso = toIsoDateOnly(row?.date_debut);
      const endIso = toIsoDateOnly(row?.date_fin) || startIso;
      if (!startIso || !endIso) return;
      if (startIso > monthEndIso || endIso < monthStartIso) return;

      leaveStats.total += 1;
      const status = String(row?.statut || "").toLowerCase();
      if (status.startsWith("approuv")) {
        leaveStats.approved += 1;
        expandIsoRange(startIso, endIso).forEach((dayIso) => {
          if (dayIso >= monthStartIso && dayIso <= monthEndIso) {
            approvedLeaveDays.add(dayIso);
          }
        });
      } else if (status.startsWith("refus")) {
        leaveStats.refused += 1;
      } else if (status.startsWith("annul")) {
        leaveStats.canceled += 1;
      } else {
        leaveStats.pending += 1;
      }
    });

    const lateItems = [];
    plannedStartByDate.forEach((planned, dateIso) => {
      if (!workDays.has(dateIso)) return;
      const checkIn = firstCheckInByDate.get(dateIso);
      if (!checkIn) return;
      if (checkIn.minutes <= planned.minutes + 15) return;

      lateItems.push({
        date: dateIso,
        planned_start: planned.label,
        check_in_time: checkIn.label,
        delay_minutes: checkIn.minutes - planned.minutes,
      });
    });

    const absentDays = Array.from(plannedDays).filter(
      (dayIso) => !workDays.has(dayIso) && !approvedLeaveDays.has(dayIso)
    ).length;
    const approvedLeaveCount = Array.from(approvedLeaveDays).filter((dayIso) => plannedDays.has(dayIso)).length;

    lateItems.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    return res.json({
      month: {
        mois,
        annee,
        label: monthLabel,
        start: monthStartIso,
        end: monthEndIso,
      },
      metrics: {
        planned_days: plannedDays.size,
        worked_days: workDays.size,
        late_days: lateItems.length,
        absent_days: absentDays,
        approved_leave_days: approvedLeaveCount,
        leave_requests: leaveStats.total,
        approved_leave_requests: leaveStats.approved,
        pending_leave_requests: leaveStats.pending,
        refused_leave_requests: leaveStats.refused,
        canceled_leave_requests: leaveStats.canceled,
      },
      late_items: lateItems.slice(0, 8),
    });
  } catch (error) {
    console.error("attendance getMyMonthlySummary error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};
//ta9ra localisation mta3 user
const parseClientLocation = (req) => {
  const lat = parseFloatOrNull(req.body?.latitude);
  const lng = parseFloatOrNull(req.body?.longitude);
  const accuracyM = parseFloatOrNull(req.body?.accuracy_m ?? req.body?.accuracyM);
  return { lat, lng, accuracyM };
};

const doAttendance = async (req, res, eventType) => {
  try {
    const { matricule, role } = resolveCaller(req);
    if (!requireMatricule(matricule, res)) return;

    if (isAdminRole(role)) {
      return res.status(403).json({ message: "Acces refuse (pointage interdit pour admin)." });
    }

    if (eventType === "check_out") {
      const hasCheckIn = await hasTodayEvent(matricule, "check_in", pool);
      if (!hasCheckIn) {
        return res.status(409).json({ message: "Check-in requis avant check-out." });
      }
    } else if (eventType === "check_in") {
      const todayIso = new Date().toISOString().slice(0, 10);
      const onLeave = await checkApprovedCongeOverlap(matricule, todayIso, todayIso, pool);
      if (onLeave) {
        return res.status(403).json({ message: "Vous êtes en congé aujourd'hui, vous ne pouvez pas faire de check-in." });
      }
    }

    const already = await hasTodayEvent(matricule, eventType, pool);
    if (already) {
      return res.status(409).json({ message: `Vous avez deja fait ${eventType === "check_in" ? "check-in" : "check-out"} aujourd'hui.` });
    }

    const { lat, lng, accuracyM } = parseClientLocation(req);
    if (lat === null || lng === null) {
      return res.status(400).json({ message: "Localisation requise (latitude/longitude)." });
    }

    const clientTime = typeof req.body?.client_time === "string" ? req.body.client_time : "";
    const geo = geofenceConfig();

    let withinGeofence = null;
    let distM = null;
    if (geo.enabled) {
      distM = distanceMeters(lat, lng, geo.lat, geo.lng);
      withinGeofence = distM <= geo.radiusM;
      if (!withinGeofence) {
        return res.status(403).json({
          message: `Hors zone autorisee (distance ~${Math.round(distM)}m, rayon ${Math.round(geo.radiusM)}m).`,
          distance_m: distM,
          radius_m: geo.radiusM,
        });
      }
    }

    const event = await insertAttendanceEvent(
      {
        matricule,
        eventType,
        clientTime,
        latitude: lat,
        longitude: lng,
        accuracyM,
        withinGeofence,
        distanceM: distM,
        geofenceLat: geo.enabled ? geo.lat : null,
        geofenceLng: geo.enabled ? geo.lng : null,
        geofenceRadiusM: geo.enabled ? geo.radiusM : null,
      },
      pool
    );

    const summary = await fetchTodaySummary(matricule, pool);
    return res.status(201).json({ event, summary });
  } catch (error) {
    console.error("attendance doAttendance error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const checkIn = async (req, res) => doAttendance(req, res, "check_in");
const checkOut = async (req, res) => doAttendance(req, res, "check_out");

module.exports = { getGeofence, getToday, getAdminToday, getMyMonthlySummary, checkIn, checkOut };
