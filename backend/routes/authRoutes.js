const express = require("express");
const { login, requestReset, resetPassword } = require("../controllers/authController");

const router = express.Router();

router.post("/login", login);
router.post("/request-reset", requestReset);
router.post("/reset-password", resetPassword);

module.exports = router;


