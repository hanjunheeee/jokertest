// 신고 경로 파일, /reports 아래 신고 접수 (로그인 + 사람마다 요청 수 제한)
// index.js가 /reports에 붙임, 처리기는 controllers/ops/player.js
const express = require("express");
const router  = express.Router();

const { verifyToken } = require("../middlewares/auth.middleware");
const { createRateLimiter } = require("../middlewares/rateLimit.middleware");
const playerOpsController = require("../controllers/ops/player");

// 한 사람 1분에 5번 (같은 판 같은 대상 중복은 서비스가 따로 막음)
const reportRateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyOf: (req) => `report:${req.user.uuid}`,
    message: "신고가 너무 많습니다. 잠시 후 다시 시도해주세요.",
});

router.post("/", verifyToken, reportRateLimit, playerOpsController.submitReport);

module.exports = router;
