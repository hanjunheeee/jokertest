// 상태 확인 경로 파일, /health 하나 (프록시·감시·docker healthcheck가 서버·DB 살아 있는지 물음)
// index.js가 /health에 붙임, 로그인 필요 없음 (응답엔 살아 있는지만, 내부 열쇠 맞으면 서버 숫자 더함)
const express = require("express");
const router  = express.Router();

const crypto  = require("crypto");

// 내부 열쇠(X-Internal-Key)가 INTERNAL_API_KEY(32자 이상)와 같을 때만 true (키 안 정했으면 늘 false)
// 해시해 길이 맞춘 뒤 상수 시간 비교 (내부 API 열쇠 검사와 같은 규칙)
const hasInternalKey = (req) => {
    const expected = typeof process.env.INTERNAL_API_KEY === "string" ? process.env.INTERNAL_API_KEY : "";
    const given = req.headers?.["x-internal-key"];
    if (expected.length < 32 || typeof given !== "string" || given.length === 0) return false;
    const a = crypto.createHash("sha256").update(given).digest();
    const b = crypto.createHash("sha256").update(expected).digest();
    return crypto.timingSafeEqual(a, b);
};

// Node 여러 개 칸: serverId·redis(up|down|off)·draining (8-5장)
// REDIS_URL·SERVER_ID 둘 다 안 넣은 단일 서버는 안 실음 → 응답이 예전과 똑같음
// Redis down이어도 200 그대로 (대체 동작으로 돎), 표시만 함
const clusterFields = () => {
    const cluster = require("../cluster");
    if (!cluster.isEnabled() && !cluster.config().serverIdExplicit) return {};
    return { serverId: cluster.serverId(), redis: cluster.state(), draining: cluster.nodes.isDraining() };
};

// DB에 SELECT 1 → 되면 200, 안 되면 503 (DB는 부를 때 불러 시험이 바꿔 끼우게)
// 열쇠 맞으면 server 칸: 메모리·이벤트 루프 지연·연결 수 (부하 시험이 읽음)
router.get("/", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const extra = { ...clusterFields(), ...(hasInternalKey(req) ? { server: require("../utils/serverStats").collectServerStats() } : {}) };
    try {
        await require("../models").sequelize.query("SELECT 1");
        res.status(200).json({ ok: true, ...extra });
    } catch {
        res.status(503).json({ ok: false, code: "DB_UNAVAILABLE", ...extra });
    }
});

module.exports = router;
