// 브라우저 시험(e2e) 경로 파일, 역할 미리 정하기·판/방 들여다보기·지금 단계 바로 끝내기 (Node 여러 개면 방·판 Node 것을 RPC로)
// index.js가 E2E_HOOKS=1이고 운영 아닐 때만 /e2e에 붙임 (운영이면 경로 자체 없음 + 값 있으면 시작 거부), 열쇠는 /internal과 같은 X-Internal-Key
const express = require("express");

const { isE2eHooksEnabled } = require("../config/e2eHooks");
const { requireInternalKey } = require("../middlewares/internalKey.middleware");
const remoteHooks = require("../socket/e2e/remoteHooks");

// async 처리기 오류는 다음 오류 처리로 (Express 4는 Promise 거절을 안 받음)
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const createE2eRouter = ({ env = process.env } = {}) => {
    const router = express.Router();

    // 한 번 더: 꺼졌으면 없는 경로처럼 (붙인 뒤 환경이 바뀌어도 안 샘)
    router.use((req, res, next) => (isE2eHooksEnabled(env) ? next() : next("router")));
    router.use(requireInternalKey({ env }));
    router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

    // POST /e2e/role-presets { presets: { uuid: "JOKER" }, roomId? } → 다음 판 시작 때 그 역할로 (roomId 주면 그 방 판에만)
    // Node 여러 개면 전 Node에 넣음 (판이 어느 Node에서 시작해도 씀)
    router.post("/role-presets", async (req, res) => {
        let result;
        try {
            result = await remoteHooks.setRolePresets(req.body?.presets, { roomId: req.body?.roomId ?? undefined });
        } catch (error) {
            return res.status(400).json({ ok: false, code: "INVALID_PRESETS", message: error.message });
        }
        const body = { ok: true, pending: result.size, scope: req.body?.roomId ? "room" : "users" };
        return res.json(result.partial ? { ...body, partial: true } : body);
    });

    // DELETE /e2e/role-presets { uuids?: [], roomId?, all? } → 미리 정한 것 지우기 (Node 여러 개면 전 Node)
    // 전부 지우기는 all: true일 때만 (병렬로 도는 남의 시험 예약까지 지우지 않게, 빈 본문은 400)
    router.delete("/role-presets", wrap(async (req, res) => {
        const { uuids, roomId, all } = req.body ?? {};
        if (all === true) {
            await remoteHooks.clearRolePresets();
            return res.json({ ok: true, cleared: "all" });
        }
        if (!Array.isArray(uuids) && !roomId) {
            return res.status(400).json({ ok: false, code: "INVALID_TARGET", message: "uuids·roomId·all: true 중 하나" });
        }
        await remoteHooks.clearRolePresets({ uuids: Array.isArray(uuids) ? uuids : undefined, roomId: roomId || undefined });
        return res.json({ ok: true });
    }));

    // GET /e2e/users/:uuid/game → 그 사람 판 요약 (역할·생존·단계) + 판 있는 Node (종료 시험이 끌 Node 고르기용)
    router.get("/users/:uuid/game", wrap(async (req, res) => {
        const { value: game, node } = await remoteHooks.describeUserGame(req.params.uuid);
        if (!game) return res.status(404).json({ ok: false, code: "NO_GAME" });
        return res.json({ ok: true, game, node });
    }));

    // GET /e2e/users/:uuid/room → 그 사람 대기방 요약 (방 코드·방장·사람)
    router.get("/users/:uuid/room", wrap(async (req, res) => {
        const { value: room, node } = await remoteHooks.describeUserRoom(req.params.uuid);
        if (!room) return res.status(404).json({ ok: false, code: "NO_ROOM" });
        return res.json({ ok: true, room, node });
    }));

    // GET /e2e/games/:gameId → 판 요약
    router.get("/games/:gameId", wrap(async (req, res) => {
        const { value: game, node } = await remoteHooks.describeGame(req.params.gameId);
        if (!game) return res.status(404).json({ ok: false, code: "NO_GAME" });
        return res.json({ ok: true, game, node });
    }));

    // POST /e2e/games/:gameId/advance → 지금 단계 마감 타이머 바로 돌림 (시간 설정은 그대로, 기다림만 줄임), 판 Node가 돌림
    router.post("/games/:gameId/advance", wrap(async (req, res) => {
        const { value: result, node } = await remoteHooks.advance(req.params.gameId);
        if (!result.ok) return res.status(404).json(result);
        return res.json({ ...result, node });
    }));

    return router;
};

module.exports = createE2eRouter();
module.exports.createE2eRouter = createE2eRouter;
