process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "achievement-controller-test-secret";

const test   = require("node:test");
const assert = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");

const db                    = require("../../models");
const achievementController = require("../../controller/achievement.controller");
const achievementService    = require("../../services/achievementService");

const callController = async (fn, req) => {
    let status;
    let body;
    const res = {
        status(code) { status = code; return this; },
        json(payload) { body = payload; return this; },
    };
    await fn(req, res, (err) => { throw err; });
    return { status, body };
};

test("A-09: 다른 계정의 user_id를 body/query에 실어도 achievementService는 req.user.uuid만 받는다", async (t) => {
    const originalGetStatusForUser = achievementService.getStatusForUser;
    let receivedUserId = null;
    achievementService.getStatusForUser = async (userId) => {
        receivedUserId = userId;
        return [];
    };
    t.after(() => { achievementService.getStatusForUser = originalGetStatusForUser; });

    const { status, body } = await callController(achievementController.getMyAchievements, {
        user: { uuid: "victim" },
        body: { user_id: "attacker" },
        query: { user_id: "attacker" },
    });

    assert.equal(status, 200);
    assert.equal(receivedUserId, "victim");
    assert.deepEqual(body, { success: true, data: [] });
});

test("achievementService가 돌려준 진행률·달성 배열을 그대로 응답한다", async (t) => {
    const originalGetStatusForUser = achievementService.getStatusForUser;
    const fakeStatus = [
        { id: "record-1-masquerade", achieved: true, current: 3, threshold: 3 },
        { id: "noble-win-10", achieved: false, current: 2, threshold: 10 },
    ];
    achievementService.getStatusForUser = async () => fakeStatus;
    t.after(() => { achievementService.getStatusForUser = originalGetStatusForUser; });

    const { status, body } = await callController(achievementController.getMyAchievements, { user: { uuid: "u1" } });

    assert.equal(status, 200);
    assert.deepEqual(body.data, fakeStatus);
});

test("achievementService가 실패하면 next(error)로 전달된다", async (t) => {
    const originalGetStatusForUser = achievementService.getStatusForUser;
    achievementService.getStatusForUser = async () => { throw new Error("db down"); };
    t.after(() => { achievementService.getStatusForUser = originalGetStatusForUser; });

    let caught = null;
    const res = { status() { return this; }, json() { return this; } };
    await achievementController.getMyAchievements({ user: { uuid: "u1" } }, res, (err) => { caught = err; });

    assert.ok(caught instanceof Error);
    assert.equal(caught.message, "db down");
});

const { generateToken } = require("../../utils/jwt");
const { notFoundHandler, globalErrorHandler } = require("../../middleware/errorHandler");

const ROUTE_TOKEN = generateToken({ uuid: "route-u1", role: "USER", sessionId: "route-session-1" });

const startRouteServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/user", require("../../routes/user.routes"));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
};

const stubAuthDb = (t) => {
    const original = { UserSession: db.UserSession, UserBan: db.UserBan };
    db.UserSession = { findOne: async () => ({ id: "route-session-1", user_id: "route-u1", is_online: true }) };
    db.UserBan = { findOne: async () => null };
    t.after(() => {
        db.UserSession = original.UserSession;
        db.UserBan = original.UserBan;
    });
};

const stubProgressDb = (t) => {
    const original = { GameResultPlayer: db.GameResultPlayer, VoteParticipation: db.VoteParticipation, AchievementGrant: db.AchievementGrant };
    db.GameResultPlayer = { findAll: async () => [] };
    db.VoteParticipation = { findAll: async () => [] };
    db.AchievementGrant = { findAll: async () => [] };
    t.after(() => {
        db.GameResultPlayer = original.GameResultPlayer;
        db.VoteParticipation = original.VoteParticipation;
        db.AchievementGrant = original.AchievementGrant;
    });
};

test("A-09: 쿠키 없이 /user/me/achievements를 요청하면 401이다(라우트가 실제로 verifyToken 뒤에 있다)", async (t) => {
    const base = await startRouteServer(t);
    const res = await fetch(`${base}/user/me/achievements`);
    assert.equal(res.status, 401);
});

test("AC-06: 인증된 요청은 실제 라우터→컨트롤러→서비스를 통해 22개 업적 상태를 받는다", async (t) => {
    stubAuthDb(t);
    stubProgressDb(t);
    const base = await startRouteServer(t);

    const res = await fetch(`${base}/user/me/achievements`, { headers: { cookie: `accessToken=${ROUTE_TOKEN}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.length, 22);
    assert.equal(body.data.every((a) => a.achieved === false), true, "전적이 없으면 전부 미달성이어야 한다");
    assert.equal(body.data.every((a) => a.granted === false && a.grantedAt === null), true, "지급 이력이 없으면 전부 granted:false여야 한다(AC-06)");
});
