const express = require("express");
const {
  listConges,
  listCongesAdmin,
  createConge,
  updateCongeStatus,
  getCongeBalance,
} = require("../controllers/congesController");

const router = express.Router();

router.get("/", listConges);
router.get("/admin", listCongesAdmin);
router.get("/balance", getCongeBalance);
router.post("/", createConge);
router.put("/:id", updateCongeStatus);

module.exports = router;
