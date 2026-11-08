// 내부 API 경로 파일, /internal 아래 관리자 서버 전용 경로 + 열쇠·요청 수 제한 줄 세우기
// index.js가 /internal에 붙임, INTERNAL_API_KEY 없으면 경로 전체 꺼짐 (처리기는 controllers/ops/internal.js)
const express = require("express");

const { skipWhenDisabled, requireInternalKey } = require("../middlewares/internalKey.middleware");
const { createRateLimiter } = require("../middlewares/rateLimit.middleware");
const internalController = require("../controllers/ops/internal");

// 라우터 만들기 (시험이 환경값·시계·제한 수를 바꿔 넣음)
const createInternalRouter = ({ env = process.env, now = Date.now, max = 120, windowMs = 60 * 1000 } = {}) => {
    const router = express.Router();

    // 꺼졌으면 여기서 바로 빠짐 → 제한 → 열쇠 (틀린 열쇠 시도도 제한에 셈)
    router.use(skipWhenDisabled({ env }));
    router.use(createRateLimiter({ windowMs, max, now, keyOf: (req) => `internal:${req.ip}` }));
    router.use(requireInternalKey({ env }));

    // 관리자 서버만 읽으니 응답은 저장 금지
    router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

    router.post("/users/:uuid/disconnect", internalController.disconnectUser);
    router.post("/announcements", internalController.sendAnnouncement);
    router.post("/maintenance/reload", internalController.reloadMaintenance);
    router.post("/banned-words/reload", internalController.reloadBannedWords);
    router.get("/live", internalController.getLive);

    return router;
};

module.exports = createInternalRouter();
module.exports.createInternalRouter = createInternalRouter;
