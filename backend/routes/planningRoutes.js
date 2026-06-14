const express = require("express");
const {
  consultPlanning,
  createPlanning,
  deletePlanning,
  listTypeShift,
} = require("../controllers/planningController");

const router = express.Router();

router.get("/type-shift", listTypeShift);
router.get("/", consultPlanning);
router.post("/", createPlanning);
router.delete("/:id", deletePlanning);

module.exports = router;