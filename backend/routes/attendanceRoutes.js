const express = require("express");
const {
  getGeofence,
  getToday,
  getAdminToday,
  getMyMonthlySummary,
  checkIn,
  checkOut,
} = require("../controllers/attendanceController");

const router = express.Router();

router.get("/geofence", getGeofence);
router.get("/today", getToday);
router.get("/admin/today", getAdminToday);
router.get("/me/month-summary", getMyMonthlySummary);
router.post("/check-in", checkIn);
router.post("/check-out", checkOut);

module.exports = router;
