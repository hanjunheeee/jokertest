process.env.JWT_SECRET = "session-lifecycle-test-secret";

const test   = require("node:test");
const assert = require("node:assert/strict");
const jwt    = require("jsonwebtoken");

const db = require("../models");
const { verifyAccessToken, resolveSession } = require("./sessionLifecycle");

const sign = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1d" });

const stubStorage = (t, { findOne, banFindOne = async () => null }) => {
    const originalSession = db.UserSession;
    const originalBan     = db.UserBan;
    db.UserSession = { findOne };
    db.UserBan     = { findOne: banFindOne };
    t.after(() => { db.UserSession = originalSession; db.UserBan = originalBan; });
};

test("verifyAccessToken은 jwt.verify를 그대로 위임한다", () => {
    const token = sign({ uuid: "uuid-1", sessionId: "s-1" });
    const decoded = verifyAccessToken(token);
    assert.equal(decoded.uuid, "uuid-1");
    assert.equal(decoded.sessionId, "s-1");
});

test("verifyAccessToken은 서명이 다르면 던진다", () => {
    const foreignToken = jwt.sign({ uuid: "uuid-1" }, "다른-비밀키");
    assert.throws(() => verifyAccessToken(foreignToken));
});

test("sessionId가 없는 토큰은 DB 조회 없이 401이다", async (t) => {
    let lookups = 0;
    stubStorage(t, { findOne: async () => { lookups += 1; return null; } });

    const result = await resolveSession({ uuid: "uuid-1" });
    assert.deepEqual(result, { ok: false, status: 401, message: "유효하지 않거나 만료된 토큰입니다." });
    assert.equal(lookups, 0);
});

test("세션이 없으면 401이다", async (t) => {
    stubStorage(t, { findOne: async () => null });

    const result = await resolveSession({ uuid: "uuid-1", sessionId: "gone" });
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
});

test("is_online:false 세션은 401이다", async (t) => {
    stubStorage(t, { findOne: async ({ where }) => ({ id: where.id, user_id: where.user_id, is_online: false }) });

    const result = await resolveSession({ uuid: "uuid-1", sessionId: "offline" });
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
});

test("활성 밴이 있으면 세션이 유효해도 403이다", async (t) => {
    stubStorage(t, {
        findOne: async ({ where }) => ({ id: where.id, user_id: where.user_id, is_online: true }),
        banFindOne: async () => ({ reason: "욕설" }),
    });

    const result = await resolveSession({ uuid: "uuid-1", sessionId: "session-1" });
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
    assert.match(result.message, /욕설/);
});

test("세션이 온라인이고 밴이 없으면 통과한다", async (t) => {
    stubStorage(t, {
        findOne: async ({ where }) => ({ id: where.id, user_id: where.user_id, is_online: true }),
    });

    const result = await resolveSession({ uuid: "uuid-1", sessionId: "session-1" });
    assert.deepEqual(result, { ok: true });
});
