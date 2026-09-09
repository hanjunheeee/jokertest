process.env.JWT_SECRET = "auth-refresh-test-secret";

const test   = require("node:test");
const assert = require("node:assert/strict");
const jwt    = require("jsonwebtoken");
const crypto = require("node:crypto");

const userRepository = require("../repositories/user.repositories");
const authService    = require("../service/auth.service");
const { REFRESH_TOKEN_GRACE_MS } = require("../auth/cookieOptions");

// auth.service.js는 원문 자격을 sha256 해시로 바꿔서만 대조한다(hashRefreshToken은 export되지
// 않는다 — A-03이 요구하는 "원문 미저장"을 모듈 경계에서도 지키기 위함). 테스트는 같은
// 알고리즘으로 직접 해시를 계산해 세션에 미리 심어 둔다.
const hashOf = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

const REPO_KEYS = [
    "withTransaction", "findSessionForRefresh", "checkActiveBan",
    "applyRefreshRotation", "findByUuid", "markOnlineSessionsOffline",
];

const baseSession = (overrides = {}) => ({
    id: "session-1",
    user_id: "uuid-1",
    revoked_at: null,
    refresh_token_hash: null,
    refresh_previous_hash: null,
    refresh_previous_expires_at: null,
    refresh_token_expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 절대 만료까지 10일 남음
    ...overrides,
});

const stubRepo = (t, overrides = {}) => {
    const originals = Object.fromEntries(REPO_KEYS.map((key) => [key, userRepository[key]]));
    const calls = [];
    const record = (name, impl) => (...args) => { calls.push({ name, args }); return impl(...args); };

    const defaults = {
        withTransaction:           (work) => work({ id: "tx-1" }),
        findSessionForRefresh:     () => null,
        checkActiveBan:            () => null,
        applyRefreshRotation:      () => [1],
        findByUuid:                () => ({ uuid: "uuid-1", role: "USER" }),
        markOnlineSessionsOffline: () => [1],
    };

    for (const key of REPO_KEYS) {
        const impl = overrides[key] ?? defaults[key];
        userRepository[key] = record(key, impl);
    }

    t.after(() => Object.assign(userRepository, originals));
    return { calls, names: () => calls.map((c) => c.name) };
};

test("갱신 자격 쿠키가 없으면 DB 조회 없이 401이다", async (t) => {
    const { names } = stubRepo(t);
    await assert.rejects(authService.refresh(null), (error) => error.status === 401);
    assert.deepEqual(names(), []);
});

test("어떤 세션과도 매칭되지 않는 자격은 401이다", async (t) => {
    stubRepo(t, { findSessionForRefresh: () => null });
    await assert.rejects(authService.refresh("raw-unknown"), (error) => error.status === 401);
});

test("이미 폐기된 세션의 갱신 자격은 401이다", async (t) => {
    const session = baseSession({ refresh_token_hash: hashOf("raw-current"), revoked_at: new Date() });
    stubRepo(t, { findSessionForRefresh: () => session });
    await assert.rejects(authService.refresh("raw-current"), (error) => error.status === 401);
});

test("절대 만료(30일)를 넘긴 갱신 자격은 회전하지 못하고 재로그인을 요구한다", async (t) => {
    const session = baseSession({
        refresh_token_hash: hashOf("raw-current"),
        refresh_token_expires_at: new Date(Date.now() - 1_000),
    });
    stubRepo(t, { findSessionForRefresh: () => session });
    await assert.rejects(authService.refresh("raw-current"), (error) => error.status === 401);
});

test("정지된 계정은 유효한 갱신 자격이어도 403이다", async (t) => {
    const session = baseSession({ refresh_token_hash: hashOf("raw-current") });
    stubRepo(t, {
        findSessionForRefresh: () => session,
        checkActiveBan: () => ({ reason: "욕설" }),
    });
    await assert.rejects(
        authService.refresh("raw-current"),
        (error) => error.status === 403 && /욕설/.test(error.message),
    );
});

test("현재 해시와 일치하면 회전에 성공하고 새 액세스·갱신 자격을 돌려준다", async (t) => {
    const session = baseSession({ refresh_token_hash: hashOf("raw-current") });
    const { calls } = stubRepo(t, { findSessionForRefresh: () => session });

    const result = await authService.refresh("raw-current");

    assert.ok(result.accessToken);
    assert.ok(result.refreshToken);

    const decoded = jwt.verify(result.accessToken, process.env.JWT_SECRET);
    assert.equal(decoded.uuid, "uuid-1");
    assert.equal(decoded.sessionId, "session-1");

    const rotateCall = calls.find((c) => c.name === "applyRefreshRotation");
    assert.equal(rotateCall.args[0], "session-1");
    assert.equal(rotateCall.args[1].previousHash, hashOf("raw-current"));
    assert.ok(rotateCall.args[1].newHash, "새 해시가 저장되어야 합니다");
    assert.notEqual(rotateCall.args[1].newHash, hashOf("raw-current"));
    assert.ok(rotateCall.args[1].previousExpiresAt instanceof Date);

    // 새로 발급된 원문 자격이 그대로 해시로 저장되면 안 된다(A-03).
    assert.notEqual(rotateCall.args[1].newHash, result.refreshToken);
    assert.equal(rotateCall.args[1].newHash, hashOf(result.refreshToken));

    assert.equal(calls.find((c) => c.name === "markOnlineSessionsOffline"), undefined,
        "정상 회전은 세션을 폐기하면 안 됩니다");
});

test("절대 만료는 회전으로 연장되지 않는다", async (t) => {
    const originalExpiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const session = baseSession({ refresh_token_hash: hashOf("raw-current"), refresh_token_expires_at: originalExpiry });
    stubRepo(t, { findSessionForRefresh: () => session });

    await authService.refresh("raw-current");

    assert.equal(session.refresh_token_expires_at.getTime(), originalExpiry.getTime());
});

test("회전 응답 유실 유예: 방금 대체된 이전 해시는 유예 시간 안에서는 재사용 감지 없이 다시 회전한다", async (t) => {
    const session = baseSession({
        refresh_token_hash: hashOf("raw-new-from-winner"),
        refresh_previous_hash: hashOf("raw-old-lost-response"),
        refresh_previous_expires_at: new Date(Date.now() + REFRESH_TOKEN_GRACE_MS),
    });
    const { calls } = stubRepo(t, { findSessionForRefresh: () => session });

    const result = await authService.refresh("raw-old-lost-response");

    assert.ok(result.accessToken, "동시 요청의 패자도 세션을 잃지 않고 새 자격을 받아야 합니다(A-08)");
    assert.equal(calls.find((c) => c.name === "markOnlineSessionsOffline"), undefined,
        "정상적인 동시 갱신 경쟁 패배만으로 세션을 폐기하면 안 됩니다");
});

test("유예 기간이 지난 이전 해시 재사용은 탈취로 간주해 이 사용자의 모든 세션을 폐기한다", async (t) => {
    const session = baseSession({
        refresh_token_hash: hashOf("raw-current"),
        refresh_previous_hash: hashOf("raw-expired-previous"),
        refresh_previous_expires_at: new Date(Date.now() - 1_000),
    });
    const { calls } = stubRepo(t, { findSessionForRefresh: () => session });

    await assert.rejects(authService.refresh("raw-expired-previous"), (error) => error.status === 401);

    const revokeCall = calls.find((c) => c.name === "markOnlineSessionsOffline");
    assert.ok(revokeCall, "재사용 감지는 전체 세션을 폐기해야 합니다");
    assert.equal(revokeCall.args[0], "uuid-1");
});

test("현재·이전 어느 해시와도 일치하지 않는 자격은 재사용으로 간주해 전체 세션을 폐기한다", async (t) => {
    const session = baseSession({ refresh_token_hash: hashOf("raw-current") });
    const { calls } = stubRepo(t, { findSessionForRefresh: () => session });

    await assert.rejects(authService.refresh("raw-completely-unknown"), (error) => error.status === 401);
    assert.ok(calls.find((c) => c.name === "markOnlineSessionsOffline"));
});
