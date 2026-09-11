process.env.JWT_SECRET = "profile-equipment-public-responses-test-secret";
// models/index.js는 require 시점에 DATABASE_URL을 파싱한다(연결은 시도하지 않는다).
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

// F-13 AC-01/AC-02/AC-05 — backend/routes/economy.routes.js의 POST /economy/equip-profile
// HTTP 계약 시험. economy.route.test.js와 같은 패턴(discordAuth.route.test.js 근거)을 그대로
// 따른다 — economyService.equipProfileAppearance 자체의 검증 순서·소유권 판정은
// backend/service/economy.service.test.js가 fake db로 이미 검증하므로, 여기서는 라우트
// 계층의 책임만 확인한다: 인증 게이트, 알 수 없는 필드 거부(CODEX-2 관례), 본인 계정으로만
// 확정되는지(요청 본문에 userId를 실을 방법 자체가 없음), 성공 응답이 loadout 외 다른
// 정보(지갑·소유 목록 등)를 흘리지 않는지.
//
// backend/socket/__tests__/matchmaking.test.js가 "다른 계정에게 공개되는" 경로(room.players)의
// 안전성을 이미 못박고 있고, backend/service/economy.service.test.js가 getPublicProfileLoadouts
// 자체의 안전성을 이미 못박고 있다 — 이 파일은 그 둘과 겹치지 않는, 아직 테스트가 없던
// "본인 확정 HTTP 응답" 경로 하나만 추가로 고정한다(중복 방지).

const test         = require("node:test");
const assert       = require("node:assert/strict");
const express      = require("express");
const cookieParser = require("cookie-parser");
const jwt          = require("jsonwebtoken");

const { notFoundHandler, globalErrorHandler } = require("../middleware/errorHandler");
const { createError } = require("../utils/appError");
const userRepository = require("../repositories/user.repositories");
const economyService  = require("../service/economy.service");

const REPO_KEYS = ["findActiveSession", "checkActiveBan", "findByUuid"];

const stubAuthGate = (t, { accountsByUuid = {} } = {}) => {
    const originals = Object.fromEntries(REPO_KEYS.map((key) => [key, userRepository[key]]));
    userRepository.findActiveSession = async (id, userId) => ({ id, user_id: userId, is_online: true, revoked_at: null, refresh_token_expires_at: null });
    userRepository.checkActiveBan = async () => null;
    userRepository.findByUuid = async (uuid) => accountsByUuid[uuid] ?? { uuid, role: "USER" };
    t.after(() => Object.assign(userRepository, originals));
};

const stubService = (t, overrides = {}) => {
    const keys = ["equipProfileAppearance"];
    const originals = Object.fromEntries(keys.map((key) => [key, economyService[key]]));
    const calls = [];
    for (const key of keys) {
        economyService[key] = overrides[key]
            ? (...args) => { calls.push({ name: key, args }); return overrides[key](...args); }
            : (...args) => { calls.push({ name: key, args }); throw new Error(`stub for ${key} not provided`); };
    }
    t.after(() => Object.assign(economyService, originals));
    return { calls, lastCall: (name) => [...calls].reverse().find((c) => c.name === name) };
};

const USER_A = "uuid-user-a";
const tokenFor = (uuid, role = "USER") => jwt.sign({ uuid, role, sessionId: `session-${uuid}` }, process.env.JWT_SECRET, { expiresIn: "1d" });

const startServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/economy", require("../routes/economy.routes"));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
};

const request = async (base, path, { method = "GET", token, body } = {}) => {
    const headers = {};
    if (token) headers.cookie = `accessToken=${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(new URL(path, base), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
};

test("POST /economy/equip-profile: accessToken 쿠키가 없으면 401로 거부되고 서비스는 호출되지 않는다", async (t) => {
    stubAuthGate(t);
    const { calls } = stubService(t);
    const base = await startServer(t);

    const res = await request(base, "/economy/equip-profile", { method: "POST", body: { photoItemId: "player-profile-기사" } });
    assert.equal(res.status, 401);
    assert.equal(calls.length, 0);
});

test("POST /economy/equip-profile: 문서화되지 않은 필드(userId 등)가 있으면 서비스 호출 전에 400으로 거부된다", async (t) => {
    stubAuthGate(t);
    const { calls } = stubService(t);
    const base = await startServer(t);

    const res = await request(base, "/economy/equip-profile", {
        method: "POST",
        token: tokenFor(USER_A),
        // userId를 실어 다른 계정을 지목하려는 시도 — ALLOWED_EQUIP_PROFILE_FIELDS 밖이라
        // 서비스에 닿기 전에 거부되어야 한다(다른 계정을 대상으로 지정할 방법 자체가 없음).
        body: { photoItemId: "player-profile-기사", userId: "uuid-user-b" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, "UNKNOWN_EQUIP_PROFILE_FIELD");
    assert.equal(calls.length, 0);
});

test("POST /economy/equip-profile: photoItemId/borderItemId가 문자열이 아니면 400으로 거부된다", async (t) => {
    stubAuthGate(t);
    const { calls } = stubService(t);
    const base = await startServer(t);

    const res = await request(base, "/economy/equip-profile", {
        method: "POST",
        token: tokenFor(USER_A),
        body: { photoItemId: 12345, expectedRevision: "server-rev-1" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, "INVALID_EQUIP_PROFILE_REQUEST");
    assert.equal(calls.length, 0);
});

// F-13 AC-02(운영자 설계 감사, 2026-09-11) — expectedRevision은 economy.routes.js의
// equip-profile 핸들러가 서비스 호출 전에 검증하는 필수 필드가 됐다(서버 발급 영속
// revision을 CAS로 비교하는 계약, economy.service.js의 equipProfileAppearance 참고).
// 이 시험이 CAS 도입 이전에 작성돼 expectedRevision을 실은 적이 없어, 실제로는 항상
// MISSING_EXPECTED_REVISION(400)으로 서비스에 닿기도 전에 거부되고 있었다 — 이 파일이
// 검증하려던 인증 게이트·거부 전파·응답 직렬화는 실제로 한 번도 통과된 적이 없었다는
// 뜻이다. 그 결함 자체를 고정하는 시험을 추가하고, 나머지는 실제 계약대로
// expectedRevision을 실어 본래 의도한 경로(서비스까지 도달)를 검증하게 한다.
test("POST /economy/equip-profile: expectedRevision이 없거나 빈 문자열이면 서비스 호출 전에 400(MISSING_EXPECTED_REVISION)으로 거부된다", async (t) => {
    stubAuthGate(t);
    const { calls } = stubService(t);
    const base = await startServer(t);

    const withoutField = await request(base, "/economy/equip-profile", {
        method: "POST",
        token: tokenFor(USER_A),
        body: { photoItemId: "player-profile-기사" },
    });
    assert.equal(withoutField.status, 400);
    assert.equal(withoutField.json.code, "MISSING_EXPECTED_REVISION");

    const emptyField = await request(base, "/economy/equip-profile", {
        method: "POST",
        token: tokenFor(USER_A),
        body: { photoItemId: "player-profile-기사", expectedRevision: "" },
    });
    assert.equal(emptyField.status, 400);
    assert.equal(emptyField.json.code, "MISSING_EXPECTED_REVISION");

    assert.equal(calls.length, 0, "expectedRevision 검증에 실패하면 서비스가 아예 호출되면 안 된다");
});

test("POST /economy/equip-profile: 서비스는 항상 토큰의 uuid로만 호출되고 expectedRevision을 그대로 전달한다(요청 본문으로 다른 계정을 지정할 수 없다)", async (t) => {
    stubAuthGate(t);
    const { lastCall } = stubService(t, {
        equipProfileAppearance: async () => ({
            selected_profile_photo_id: "player-profile-기사",
            selected_profile_border_id: "profile-border-귀족",
            selected_card_frame_id: "player-card-베이스",
        }),
    });
    const base = await startServer(t);

    await request(base, "/economy/equip-profile", {
        method: "POST",
        token: tokenFor(USER_A),
        body: { photoItemId: "player-profile-기사", borderItemId: "profile-border-귀족", expectedRevision: "server-rev-1" },
    });

    const call = lastCall("equipProfileAppearance");
    assert.equal(call.args[0].userId, USER_A);
    assert.equal(call.args[0].expectedRevision, "server-rev-1");
});

test("POST /economy/equip-profile: 소유하지 않은 상품이면 서비스가 던진 403을 그대로 응답한다", async (t) => {
    stubAuthGate(t);
    stubService(t, {
        equipProfileAppearance: async () => { throw createError("보유하지 않은 상품은 장착할 수 없습니다.", 403, "ITEM_NOT_OWNED"); },
    });
    const base = await startServer(t);

    const res = await request(base, "/economy/equip-profile", {
        method: "POST",
        token: tokenFor(USER_A),
        body: { borderItemId: "profile-border-황제", expectedRevision: "server-rev-1" },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, "ITEM_NOT_OWNED");
});

// F-13 AC-02: 서비스가 CAS 충돌(409)로 거부해도 라우트는 그 status·code를 그대로 전파해야
// 한다 — economy.store.js의 authoritative GET 재조정이 이 정확한 code(PROFILE_REVISION_CONFLICT)
// 로만 트리거되므로(economy.store.js의 equipProfile 참고), 라우트가 이를 다른 status로
// 뭉개면 클라이언트 재조정 자체가 작동하지 않는다.
test("POST /economy/equip-profile: 서버 CAS 충돌(409)이면 서비스가 던진 오류를 그대로 응답한다", async (t) => {
    stubAuthGate(t);
    stubService(t, {
        equipProfileAppearance: async () => { throw createError("다른 확정이 먼저 커밋되었습니다.", 409, "PROFILE_REVISION_CONFLICT"); },
    });
    const base = await startServer(t);

    const res = await request(base, "/economy/equip-profile", {
        method: "POST",
        token: tokenFor(USER_A),
        body: { borderItemId: "profile-border-남작", expectedRevision: "stale-rev" },
    });
    assert.equal(res.status, 409);
    assert.equal(res.json.code, "PROFILE_REVISION_CONFLICT");
});

test("POST /economy/equip-profile: 성공 응답은 loadout 네 필드(revision 포함)만 담고 지갑·소유 목록 등 다른 정보를 흘리지 않는다", async (t) => {
    stubAuthGate(t);
    stubService(t, {
        // 서비스가 실수로 다른 필드(지갑 등)를 함께 돌려줘도 라우트의 serializeLoadout이
        // 딱 정해진 필드만 골라 응답해야 한다 — 그 안전판을 증명하기 위해 fake만 여분 필드를 싣는다.
        equipProfileAppearance: async () => ({
            selected_profile_photo_id: "player-profile-기사",
            selected_profile_border_id: "profile-border-귀족",
            selected_card_frame_id: "player-card-베이스",
            revision: "server-rev-2",
            balance_gold: 999999,
            entitlements: ["secret-item"],
        }),
    });
    const base = await startServer(t);

    const res = await request(base, "/economy/equip-profile", {
        method: "POST",
        token: tokenFor(USER_A),
        body: { photoItemId: "player-profile-기사", borderItemId: "profile-border-귀족", expectedRevision: "server-rev-1" },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.json).sort(), ["loadout"]);
    assert.deepEqual(Object.keys(res.json.loadout).sort(), ["revision", "selectedCardFrameId", "selectedProfileBorderId", "selectedProfilePhotoId"]);
    assert.equal(res.json.loadout.selectedProfilePhotoId, "player-profile-기사");
    assert.equal(res.json.loadout.selectedProfileBorderId, "profile-border-귀족");
    assert.equal(res.json.loadout.revision, "server-rev-2");
});
