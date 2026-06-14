const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const personnelRoutes = require("./routes/personnelRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const congesRoutes = require("./routes/congesRoutes");
const planningRoutes = require("./routes/planningRoutes");
const gradeRoutes = require("./routes/gradeRoutes");
const typesCongeRoutes = require("./routes/typesCongeRoutes");
const planningRequestsRoutes = require("./routes/planningRequestsRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const payrollRoutes = require("./routes/payrollRoutes");
const chatRoutes = require("./routes/chatRoutes");

const app = express();

app.use(cors());//yasma7 lilfront bch y3ayet lel backend w yjib data
app.use(express.json());//tkhali expres tifhilmm json data ilijaya milfornt


app.get("/forgot-password", (req, res) => {
  const frontendBase =
    process.env.APP_PUBLIC_URL || process.env.APP_URL || "http://localhost:5173";
  const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
  const target = `${frontendBase.replace(/\/+$/, "")}/forgot-password${query}`;
  return res.redirect(302, target);
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/personnel", personnelRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/conges", congesRoutes);
app.use("/api/types-conge", typesCongeRoutes);
app.use("/api/planning", planningRoutes);
app.use("/api/grades", gradeRoutes);
app.use("/api/planning-requests", planningRequestsRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/chat", chatRoutes);

module.exports = app;