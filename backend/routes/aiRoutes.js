const express = require("express");
const router = express.Router();

const {
    chatWithAI,
    getDashboardSummary
} = require("../controllers/aiController");

router.post("/chat", chatWithAI);

router.get("/dashboard-summary", getDashboardSummary);

module.exports = router;