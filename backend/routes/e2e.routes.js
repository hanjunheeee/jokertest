// 브라우저 시험(e2e) 경로 파일, 역할 미리 정하기·판/방 들여다보기·지금 단계 바로 끝내기
// index.js가 E2E_HOOKS=1이고 운영 아닐 때만 /e2e에 붙임 (운영이면 경로 자체 없음 + 값 있으면 시작 거부), 열쇠는 /internal과 같은 X-Internal-Key
const express = require("express");

const { isE2eHooksEnabled } = require("../config/e2eHooks");
const { requireInternalKey } = require("../middlewares/internalKey.middleware");
const gameHooks = require("../socket/e2e/gameHooks");

const createE2eRouter = ({ env = process.env } = {}) => {
    const router = express.Router();

    // 한 번 더: 꺼졌으면 없는 경로처럼 (붙인 뒤 환경이 바뀌어도 안 샘)
    router.use((req, res, next) => (isE2eHooksEnabled(env) ? next() : next("router")));
    router.use(requireInternalKey({ env }));
    router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

    // POST /e2e/role-presets { presets: { uuid: "JOKER" } } → 다음 판 시작 때 그 역할로
    router.post("/role-presets", (req, res) => {
        try {
            const size = gameHooks.setRolePresets(req.body?.presets);
            res.json({ ok: true, pending: size });
        } catch (error) {
            res.status(400).json({ ok: false, code: "INVALID_PRESETS", message: error.message });
        }
    });

    // DELETE /e2e/role-presets { uuids?: [] } → 미리 정한 것 지우기 (없으면 전부)
    router.delete("/role-presets", (req, res) => {
        gameHooks.clearRolePresets(req.body?.uuids);
        res.json({ ok: true });
    });

    // GET /e2e/users/:uuid/game → 그 사람 판 요약 (역할·생존·단계)
    router.get("/users/:uuid/game", (req, res) => {
        const game = gameHooks.describeSession(gameHooks.findSessionByUser(req.params.uuid));
        if (!game) return res.status(404).json({ ok: false, code: "NO_GAME" });
        return res.json({ ok: true, game });
    });

    // GET /e2e/users/:uuid/room → 그 사람 대기방 요약 (방 코드·방장·사람)
    router.get("/users/:uuid/room", (req, res) => {
        const room = gameHooks.describeRoomByUser(req.params.uuid);
        if (!room) return res.status(404).json({ ok: false, code: "NO_ROOM" });
        return res.json({ ok: true, room });
    });

    // GET /e2e/games/:gameId → 판 요약
    router.get("/games/:gameId", (req, res) => {
        const game = gameHooks.describeSession(gameHooks.getSessionById(req.params.gameId));
        if (!game) return res.status(404).json({ ok: false, code: "NO_GAME" });
        return res.json({ ok: true, game });
    });

    // POST /e2e/games/:gameId/advance → 지금 단계 마감 타이머 바로 돌림 (시간 설정은 그대로, 기다림만 줄임)
    router.post("/games/:gameId/advance", (req, res) => {
        const result = gameHooks.advanceSession(req.params.gameId);
        if (!result.ok) return res.status(404).json(result);
        return res.json(result);
    });

    return router;
};

module.exports = createE2eRouter();
module.exports.createE2eRouter = createE2eRouter;
