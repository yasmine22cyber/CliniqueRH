const express = require("express");
const {
  listPlanningRequests,
  listPlanningRequestsAdmin,
  createPlanningRequest,
  updatePlanningRequest,
  updatePlanningRequestStatus,
} = require("../controllers/planningRequestsController");

const router = express.Router();

router.get("/", listPlanningRequests);
router.get("/admin", listPlanningRequestsAdmin);
router.post("/", createPlanningRequest);
router.patch("/:id", updatePlanningRequest);
router.put("/:id", updatePlanningRequestStatus);

module.exports = router;
