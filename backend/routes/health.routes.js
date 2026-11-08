// 상태 확인 경로 파일, /health 하나 (프록시·감시가 서버·DB 살아 있는지 물음)
// index.js가 /health에 붙임, 로그인 필요 없음 (응답엔 살아 있는지만, 내부 문구 없음)
const express = require("express");
const router  = express.Router();

// DB에 SELECT 1 → 되면 200, 안 되면 503 (DB는 부를 때 불러 시험이 바꿔 끼우게)
router.get("/", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
        await require("../models").sequelize.query("SELECT 1");
        res.status(200).json({ ok: true });
    } catch {
        res.status(503).json({ ok: false, code: "DB_UNAVAILABLE" });
    }
});

module.exports = router;
