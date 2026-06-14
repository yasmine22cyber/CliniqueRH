const express = require("express");
const {
  consulteService,
  createService,
  updateService,
  deleteService,
} = require("../controllers/serviceController");

const router = express.Router();

router.get("/", consulteService);
router.post("/", createService);
router.put("/:id", updateService);
router.delete("/:id", deleteService);

module.exports = router;