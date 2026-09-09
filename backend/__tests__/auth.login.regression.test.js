process.env.JWT_SECRET = "login-regression-test-secret";

const test   = require("node:test");
const assert = require("node:assert/strict");
const jwt    = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const userRepository = require("../repositories/user.repositories");
const authService    = require("../service/auth.service");
const { PERSISTENT_SESSION_MAX_AGE_MS, ACCESS_TOKEN_SHORT_TTL_SECONDS } = require("../auth/cookieOptions");

const PASSWORD  = "correct-horse";
const REQ_INFO  = { ip: "127.0.0.1", userAgent: "jest-ua", deviceType: "PC" };
const REPO_KEYS = [
    "withTransaction", "findByEmail", "checkActiveBan", "createLoginHistory",
    "updateUser", "markOnlineSessionsOffline", "createUserSession",
];

// AC-01/AC-03 변경이 login의 부작용 순서를 건드리지 않았는지 확인하는 기준선입니다.
// 리포지토리 함수를 전부 가짜로 바꾸고 호출 순서와 인자를 기록합니다.
const stubRepo = (t, overrides = {}) => {
    const originals = Object.fromEntries(REPO_KEYS.map((key) => [key, userRepository[key]]));
    const calls     = [];
    const record    = (name, result) => (...args) => { calls.push({ name, args }); return result; };

    const defaults = {
        // login() 전체가 하나의 트랜잭션으로 묶인다(F-03 R-IMPL #7: 비밀번호 변경과의
        // 직렬화). work를 즉시 동기 호출하는 가짜 트랜잭션이라 호출 순서 검증은 그대로 유효하다.
        withTransaction:           (work) => work({ id: "tx-1", LOCK: { UPDATE: "UPDATE" } }),
        findByEmail:               record("findByEmail", null),
        checkActiveBan:            record("checkActiveBan", null),
        createLoginHistory:        record("createLoginHistory", {}),
        updateUser:                record("updateUser", [1]),
        markOnlineSessionsOffline: record("markOnlineSessionsOffline", [1]),
        createUserSession:         record("createUserSession", {}),
    };

    for (const key of REPO_KEYS) {
        userRepository[key] = overrides[key]
            ? (...args) => { calls.push({ name: key, args }); return overrides[key](...args); }
            : defaults[key];
    }

    t.after(() => Object.assign(userRepository, originals));
    return { calls, names: () => calls.map((call) => call.name) };
};

const activeUser = async (extra = {}) => ({
    uuid:               "uuid-1",
    role:               "USER",
    password_hash:      await bcrypt.hash(PASSWORD, 10),
    failed_login_count: 0,
    locked_until:       null,
    ...extra,
});

test("정상 로그인은 세션을 만들고 sessionId가 담긴 토큰을 발급한다", async (t) => {
    const user = await activeUser();
    const { calls, names } = stubRepo(t, { findByEmail: () => user });

    const result = await authService.login({ email: "a@b.com", password: PASSWORD }, REQ_INFO);

    assert.equal(result.user.uuid, "uuid-1");

    const decoded = jwt.verify(result.token, process.env.JWT_SECRET);
    assert.equal(decoded.uuid, "uuid-1");
    assert.equal(decoded.role, "USER");
    assert.ok(decoded.sessionId, "토큰에 sessionId가 없으면 세션 검증이 조용히 무력화됩니다");

    // 토큰의 sessionId와 저장된 세션 PK가 같아야 미들웨어 조회가 성립합니다.
    const sessionArg = calls.find((call) => call.name === "createUserSession").args[0];
    assert.equal(sessionArg.id, decoded.sessionId);
    assert.equal(sessionArg.user_id, "uuid-1");
    assert.equal(sessionArg.is_online, true);

    // 기존 세션 정리 → 새 세션 생성 순서가 뒤집히면 방금 만든 세션이 즉시 내려갑니다.
    assert.deepEqual(names(), [
        "findByEmail", "checkActiveBan", "createLoginHistory",
        "updateUser", "markOnlineSessionsOffline", "createUserSession",
    ]);

    assert.deepEqual(calls.find((call) => call.name === "createLoginHistory").args[0], {
        user_id: "uuid-1", ip_address: "127.0.0.1", user_agent: "jest-ua", success: true,
    });
});

test("F-03 AC-01: 로그인 유지를 선택하면 액세스 토큰은 짧게 살고, 대신 30일 절대 만료의 회전형 갱신 자격이 함께 발급된다", async (t) => {
    const user = await activeUser();
    const { calls } = stubRepo(t, { findByEmail: () => user });

    const result = await authService.login(
        { email: "a@b.com", password: PASSWORD, rememberMe: true }, REQ_INFO,
    );
    const decoded = jwt.verify(result.token, process.env.JWT_SECRET);

    // 액세스 토큰 자체를 30일로 늘리면 만료 전까지 갱신 경로(폐기·재사용 감지)가 한 번도
    // 실행되지 않는다 — 그래서 로그인 유지 여부와 무관하게 액세스 토큰은 짧게 산다.
    assert.equal(decoded.exp - decoded.iat, ACCESS_TOKEN_SHORT_TTL_SECONDS);

    // 30일 절대 만료는 refreshToken(원문)과 그 해시가 담당한다. 원문은 응답으로만 나가고
    // DB에는 해시만 저장된다(A-03).
    assert.ok(result.refreshToken, "로그인 유지 시 갱신 자격이 발급되어야 합니다");

    const sessionArg = calls.find((call) => call.name === "createUserSession").args[0];
    assert.ok(sessionArg.refresh_token_hash, "세션에 갱신 자격 해시가 저장되어야 합니다");
    assert.notEqual(sessionArg.refresh_token_hash, result.refreshToken, "원문을 그대로 저장하면 안 됩니다");
    assert.ok(sessionArg.refresh_token_expires_at instanceof Date);
    assert.equal(
        sessionArg.refresh_token_expires_at.getTime() - Date.now() >= PERSISTENT_SESSION_MAX_AGE_MS - 5_000,
        true,
        "절대 만료는 로그인 시점 기준 30일이어야 합니다",
    );
});

test("F-03 AC-02: 로그인 유지를 선택하지 않으면 액세스 토큰은 기존처럼 1일 뒤에 만료되고, 갱신 자격은 발급되지 않는다", async (t) => {
    const user = await activeUser();
    const { calls } = stubRepo(t, { findByEmail: () => user });

    const result = await authService.login({ email: "a@b.com", password: PASSWORD }, REQ_INFO);
    const decoded = jwt.verify(result.token, process.env.JWT_SECRET);

    assert.equal(decoded.exp - decoded.iat, 24 * 60 * 60);
    assert.equal(result.refreshToken, null, "로그인 유지를 선택하지 않으면 갱신 자격을 주면 안 됩니다(AC-02)");

    const sessionArg = calls.find((call) => call.name === "createUserSession").args[0];
    assert.equal(sessionArg.refresh_token_hash, null);
    assert.equal(sessionArg.refresh_token_expires_at, null);
});

test("가입되지 않은 이메일은 401이다", async (t) => {
    stubRepo(t);
    await assert.rejects(
        authService.login({ email: "none@b.com", password: PASSWORD }, REQ_INFO),
        (error) => error.status === 401
    );
});

test("빈 로그인 payload는 DB 조회 없이 400이다", async (t) => {
    const { names } = stubRepo(t);
    await assert.rejects(authService.login({}, REQ_INFO), (error) => error.status === 400);
    assert.deepEqual(names(), []);
});

test("잠긴 계정은 423이고 비밀번호 검사까지 가지 않는다", async (t) => {
    const user = await activeUser({ locked_until: new Date(Date.now() + 60_000) });
    const { names } = stubRepo(t, { findByEmail: () => user });

    await assert.rejects(
        authService.login({ email: "a@b.com", password: PASSWORD }, REQ_INFO),
        (error) => error.status === 423
    );
    assert.deepEqual(names(), ["findByEmail"]);
});

test("활성 밴 계정은 403이다", async (t) => {
    const user = await activeUser();
    stubRepo(t, { findByEmail: () => user, checkActiveBan: () => ({ reason: "욕설" }) });

    await assert.rejects(
        authService.login({ email: "a@b.com", password: PASSWORD }, REQ_INFO),
        (error) => error.status === 403 && /욕설/.test(error.message)
    );
});

test("비밀번호 불일치는 401이고 실패 횟수를 올린다", async (t) => {
    const user = await activeUser({ failed_login_count: 1 });
    const { calls } = stubRepo(t, { findByEmail: () => user });

    await assert.rejects(
        authService.login({ email: "a@b.com", password: "wrong" }, REQ_INFO),
        (error) => error.status === 401 && /2\/5/.test(error.message)
    );

    assert.deepEqual(calls.find((call) => call.name === "updateUser").args[1], {
        failed_login_count: 2, locked_until: null,
    });
    assert.equal(calls.find((call) => call.name === "createLoginHistory").args[0].success, false);
});

test("5회째 실패는 계정을 잠그고 423을 반환한다", async (t) => {
    const user = await activeUser({ failed_login_count: 4 });
    const { calls } = stubRepo(t, { findByEmail: () => user });

    await assert.rejects(
        authService.login({ email: "a@b.com", password: "wrong" }, REQ_INFO),
        (error) => error.status === 423
    );

    const update = calls.find((call) => call.name === "updateUser").args[1];
    assert.equal(update.failed_login_count, 5);
    assert.ok(update.locked_until instanceof Date);
});
