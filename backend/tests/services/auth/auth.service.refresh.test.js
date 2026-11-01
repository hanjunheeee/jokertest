process.env.JWT_SECRET = "auth-refresh-test-secret";

const test   = require("node:test");
const assert = require("node:assert/strict");
const jwt    = require("jsonwebtoken");
const crypto = require("node:crypto");

const userRepository = require("../../../repositories/user.repositories");
const authService    = require("../../../services/auth/account");
const { REFRESH_TOKEN_GRACE_MS } = require("../../../auth/cookieOptions");

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
    refresh_token_expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
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

test("F-03 R-IMPL #8: grace 재시도(회전 응답 유실·동시 요청)는 회전을 다시 실행하지 않고, 실제로 이미 회전된 것과 정확히 같은 자격을 재현한다", async (t) => {
    const session = baseSession({
        refresh_token_hash: hashOf("raw-new-from-winner"),
        refresh_previous_hash: hashOf("raw-old-lost-response"),
        refresh_previous_expires_at: new Date(Date.now() + REFRESH_TOKEN_GRACE_MS),
    });
    const { calls } = stubRepo(t, { findSessionForRefresh: () => session });

    const result = await authService.refresh("raw-old-lost-response");

    assert.ok(result.accessToken, "동시 요청의 패자도, 응답을 잃은 클라이언트도 세션을 잃지 않고 새 액세스 토큰을 받아야 합니다(A-08)");
    assert.ok(result.refreshToken,
        "회전 응답 자체가 유실되면(첫 응답을 못 받음) grace 재시도가 유일한 복구 수단이다 — " +
        "refreshToken이 없으면 브라우저에 최신 갱신 자격이 남지 않아 grace 종료 후 재사용으로 폐기된다(R-IMPL #8)");
    assert.equal(calls.find((c) => c.name === "applyRefreshRotation"), undefined,
        "grace 재시도는 회전(applyRefreshRotation)을 또 실행하면 안 됩니다 — 이미 회전된 결과를 재계산할 뿐입니다");
    assert.equal(calls.find((c) => c.name === "markOnlineSessionsOffline"), undefined,
        "정상적인 동시 갱신 경쟁 패배·응답 유실만으로 세션을 폐기하면 안 됩니다");
});

test("F-03 R-IMPL #8: 같은 이전 자격으로 여러 번(역순 포함) 재시도해도 항상 동일한 복구 자격을 돌려준다", async (t) => {
    const session = baseSession({
        refresh_token_hash: hashOf("raw-new-from-winner"),
        refresh_previous_hash: hashOf("raw-old-lost-response"),
        refresh_previous_expires_at: new Date(Date.now() + REFRESH_TOKEN_GRACE_MS),
    });
    stubRepo(t, { findSessionForRefresh: () => session });

    const first = await authService.refresh("raw-old-lost-response");
    const second = await authService.refresh("raw-old-lost-response");
    const third = await authService.refresh("raw-old-lost-response");

    assert.equal(first.refreshToken, second.refreshToken);
    assert.equal(second.refreshToken, third.refreshToken);
});

test("F-03 R-IMPL #8: 응답 유실 후 재시도로 복구한 자격은 grace가 끝난 뒤 정상적인 다음 회전에 그대로 쓸 수 있다", async (t) => {
    const session = baseSession({ refresh_token_hash: hashOf("raw-current") });
    const { calls } = stubRepo(t, {
        findSessionForRefresh: () => session,
        applyRefreshRotation: (sessionId, { newHash, previousHash, previousExpiresAt }) => {
            session.refresh_token_hash = newHash;
            session.refresh_previous_hash = previousHash;
            session.refresh_previous_expires_at = previousExpiresAt;
            return [1];
        },
    });

    const lostResponse = await authService.refresh("raw-current");
    const recovered = await authService.refresh("raw-current");
    assert.equal(recovered.refreshToken, lostResponse.refreshToken);

    session.refresh_previous_expires_at = new Date(Date.now() - 1_000);

    const next = await authService.refresh(recovered.refreshToken);
    assert.ok(next.accessToken);
    assert.ok(next.refreshToken);
    assert.notEqual(next.refreshToken, recovered.refreshToken);
    assert.equal(calls.filter((c) => c.name === "applyRefreshRotation").length, 2,
        "실제 회전은 lostResponse와 next, 두 번만 일어나야 합니다(복구 재시도는 회전하지 않습니다)");
});

test("현재 해시와 매치한 요청만 실제로 회전하고, 방금 만든 previous_hash로는 새 세션을 또 잠그지 않는다", async (t) => {
    const rotatedSession = baseSession({
        refresh_token_hash: hashOf("raw-current"),
        refresh_previous_hash: null,
        refresh_previous_expires_at: null,
    });
    const { calls } = stubRepo(t, { findSessionForRefresh: () => rotatedSession });

    await authService.refresh("raw-current");

    const rotateCall = calls.find((c) => c.name === "applyRefreshRotation");
    assert.ok(rotateCall, "현재 해시 매치는 정상적으로 회전해야 합니다");
    assert.equal(rotateCall.args[1].previousHash, hashOf("raw-current"));
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

test("정지 감지 시 401/409가 아니라 403이며, 이 계정의 모든 세션을 함께 영구 폐기한다(밴 해제 후 복원 방지)", async (t) => {
    const session = baseSession({ refresh_token_hash: hashOf("raw-current") });
    const { calls } = stubRepo(t, {
        findSessionForRefresh: () => session,
        checkActiveBan: () => ({ reason: "욕설" }),
    });

    await assert.rejects(
        authService.refresh("raw-current"),
        (error) => error.status === 403 && /욕설/.test(error.message),
    );

    const revokeCall = calls.find((c) => c.name === "markOnlineSessionsOffline");
    assert.ok(revokeCall, "정지 감지 시점에 전체 세션을 폐기해야 밴 해제 후에도 과거 세션이 되살아나지 않습니다(R-IMPL #7)");
    assert.equal(revokeCall.args[0], "uuid-1");
    assert.equal(calls.find((c) => c.name === "applyRefreshRotation"), undefined,
        "정지된 계정에 새 갱신 자격을 발급하면 안 됩니다");
});

test("절대 기한이 임박하면 새 액세스 토큰의 exp가 기본 TTL 대신 남은 시간만큼만 발급된다", async (t) => {
    const remainingMs = 5_000;
    const session = baseSession({
        refresh_token_hash: hashOf("raw-current"),
        refresh_token_expires_at: new Date(Date.now() + remainingMs),
    });
    stubRepo(t, { findSessionForRefresh: () => session });

    const result = await authService.refresh("raw-current");
    const decoded = jwt.verify(result.accessToken, process.env.JWT_SECRET);

    const ttlSeconds = decoded.exp - decoded.iat;
    assert.ok(ttlSeconds <= 5, `절대 기한(5초 남음)을 넘는 TTL이 발급되면 안 됩니다: ${ttlSeconds}`);
    assert.ok(ttlSeconds >= 1, `절대 기한 이내에서는 굳이 즉시 만료시킬 필요가 없습니다: ${ttlSeconds}`);
    assert.ok(decoded.exp * 1000 <= session.refresh_token_expires_at.getTime(),
        "exp(초 반올림 포함)가 절대 기한을 넘으면 안 됩니다");
});

test("절대 기한을 이미 넘긴 세션은(초 단위 경계) 회전 대신 만료로 거부된다", async (t) => {
    const session = baseSession({
        refresh_token_hash: hashOf("raw-current"),
        refresh_token_expires_at: new Date(Date.now() - 1),
    });
    const { calls } = stubRepo(t, { findSessionForRefresh: () => session });

    await assert.rejects(authService.refresh("raw-current"), (error) => error.status === 401);
    assert.equal(calls.find((c) => c.name === "applyRefreshRotation"), undefined);
});
