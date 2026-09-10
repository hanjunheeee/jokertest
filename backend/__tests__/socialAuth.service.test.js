// models/index.js는 require 시점에 DATABASE_URL을 파싱한다(연결은 시도하지 않는다) —
// 이 파일은 아래에서 userRepository의 모든 메서드를 인메모리 가짜로 바꿔치기하므로 실제
// 쿼리는 절대 실행되지 않는다(backend/.env.test와 같은 원칙, socialAuth.route.test.js 참고).
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

const test   = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

// F-06 CODEX-1 재검토 지적 AC-04: googleAuth.route.test.js는 socialAuthService 자체를
// 스텁으로 대체해 그 위 라우트 계층(순서·쿠키·리다이렉트)만 검증한다 — consumeOAuthState의
// 실제 동시 재사용 방지와 resolveOAuthAccount의 실제 자동 병합 금지 로직 자체는 그 파일에서
// 증명되지 않는다(스텁이 시나리오를 그대로 재현할 뿐, 서비스 코드 자체를 태우지 않는다).
// backend/tests/db/f05-social-auth.integration.test.js가 실제 MySQL로 이 계약을 증명하지만
// F01_TEST_DATABASE_URL이 없는 환경(이 저장소의 기본 상태)에서는 skip된다.
//
// 이 파일은 socialAuthService.consumeOAuthState/resolveOAuthAccount를 스텁으로 바꾸지
// 않고 그대로 호출한다 — 대신 userRepository만 인메모리 가짜로 교체해, 실제 Sequelize의
// FOR UPDATE 행 잠금이 만드는 "같은 행을 잠근 트랜잭션은 커밋할 때까지 직렬화된다"는
// 계약을 재현한다. 이렇게 하면 DB 없이도 서비스 코드 자체(잠금 획득 순서, consumed_at
// 확인 순서, 이메일 충돌 판정)를 실제로 실행해 검증할 수 있다.

const userRepository = require("../repositories/user.repositories");
const authService    = require("../service/auth.service");
const socialAuthService = require("../service/socialAuth.service");

const hashValue = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

// 실제 DB의 SELECT ... FOR UPDATE를 흉내 낸다: 같은 키에 대한 두 번째 잠금 요청은 첫 번째
// 트랜잭션이 끝날 때까지(성공이든 실패든) 대기했다가 그제서야 순서를 얻는다 — SELECT가
// 끝나는 즉시 풀리는 게 아니라 트랜잭션 커밋/롤백 시점에 풀린다는 점이 중요하다(그래야
// "조회 → 검증 → 갱신"이 하나의 원자적 구간이 된다).
const createRowLocks = () => {
    const tails = new Map();
    return {
        acquire(key) {
            const previousTail = tails.get(key) ?? Promise.resolve();
            let release;
            const gate = new Promise((resolve) => { release = resolve; });
            tails.set(key, previousTail.then(() => gate));
            const acquired = previousTail.then(() => release);
            return acquired;
        },
    };
};

const createFakeUserRepository = () => {
    const oauthStates = new Map(); // state_hash -> row
    let nextStateId = 1;
    const usersByUuid = new Map();
    const usersByEmail = new Map();
    const externalIdentities = new Map(); // `${provider}:${subject}` -> row
    const socialSignupIntents = new Map(); // intent_token_hash -> row
    const locks = createRowLocks();

    return {
        async withTransaction(work) {
            const transaction = { LOCK: { UPDATE: "UPDATE" }, __releases: [] };
            try {
                return await work(transaction);
            } finally {
                for (const release of transaction.__releases.splice(0)) release();
            }
        },
        async createOAuthState({ state_hash, purpose, user_id, session_id, browser_fingerprint_hash, expires_at }) {
            oauthStates.set(state_hash, {
                id: nextStateId++, state_hash, purpose, user_id, session_id,
                browser_fingerprint_hash, expires_at, consumed_at: null,
            });
        },
        async findOAuthStateByHash(stateHash, options = {}) {
            const { transaction, lock } = options;
            if (lock) {
                const release = await locks.acquire(`oauth_state:${stateHash}`);
                transaction.__releases.push(release);
            }
            const row = oauthStates.get(stateHash);
            return row ? { ...row } : null;
        },
        async markOAuthStateConsumed(id) {
            for (const row of oauthStates.values()) {
                if (row.id === id) row.consumed_at = new Date();
            }
        },
        async findExternalIdentity({ provider, subject }, options = {}) {
            const { transaction, lock } = options;
            const key = `${provider}:${subject}`;
            if (lock) {
                const release = await locks.acquire(`identity:${key}`);
                transaction.__releases.push(release);
            }
            const row = externalIdentities.get(key);
            return row ? { ...row } : null;
        },
        async createExternalIdentity(data) {
            const key = `${data.provider}:${data.subject}`;
            const row = { ...data };
            externalIdentities.set(key, row);
            return row;
        },
        async findByUuid(uuid) {
            const row = usersByUuid.get(uuid);
            return row ? { ...row } : null;
        },
        async findByEmail(email) {
            const uuid = usersByEmail.get(email);
            return uuid ? { ...usersByUuid.get(uuid) } : null;
        },
        // 테스트 준비용 헬퍼(실제 repository 계약에는 없다) — 이메일 충돌 시나리오를 위해
        // "이미 비밀번호로 가입된 계정"을 미리 심어 둔다.
        __seedExistingUser(user) {
            usersByUuid.set(user.uuid, user);
            usersByEmail.set(user.email, user.uuid);
        },
        async createSocialSignupIntent(data) {
            socialSignupIntents.set(data.intent_token_hash, { ...data, id: crypto.randomUUID(), consumed_at: null });
        },
    };
};

const withFakeRepository = (t) => {
    const fake = createFakeUserRepository();
    const originals = { ...userRepository };
    for (const key of Object.keys(originals)) {
        delete userRepository[key];
    }
    Object.assign(userRepository, fake);
    t.after(() => {
        for (const key of Object.keys(userRepository)) delete userRepository[key];
        Object.assign(userRepository, originals);
    });
    return fake;
};

const withIssueSessionSpy = (t, impl) => {
    const original = authService.issueSessionForUser;
    const calls = [];
    authService.issueSessionForUser = async (...args) => {
        calls.push(args);
        return impl ? impl(...args) : { token: "session-token", refreshToken: null, refreshTokenExpiresAt: null };
    };
    t.after(() => { authService.issueSessionForUser = original; });
    return calls;
};

const issueState = async (fake, { purpose = "login", browserFingerprint = "fp-1" } = {}) => {
    const rawState = crypto.randomBytes(16).toString("base64url");
    await fake.createOAuthState({
        state_hash: hashValue(rawState),
        purpose,
        user_id: null,
        session_id: null,
        browser_fingerprint_hash: hashValue(browserFingerprint),
        expires_at: new Date(Date.now() + 10 * 60 * 1000),
    });
    return { rawState, browserFingerprint };
};

// ── AC-04/R-IMPL #3: 실제 consumeOAuthState의 동시 재사용 방지 ──────────────────

test("동시에 들어온 같은 state 소비 요청은 실제 consumeOAuthState 기준으로 하나만 성공하고 나머지는 STATE_REUSED로 거부된다", async (t) => {
    const fake = withFakeRepository(t);
    const { rawState, browserFingerprint } = await issueState(fake);

    const results = await Promise.allSettled([
        socialAuthService.consumeOAuthState(rawState, { browserFingerprint, purpose: "login" }),
        socialAuthService.consumeOAuthState(rawState, { browserFingerprint, purpose: "login" }),
        socialAuthService.consumeOAuthState(rawState, { browserFingerprint, purpose: "login" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected  = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "행 잠금으로 직렬화되어 동시 요청 중 정확히 하나만 성공해야 합니다");
    assert.equal(rejected.length, 2);
    for (const r of rejected) {
        assert.equal(r.reason.code, "STATE_REUSED");
    }
});

test("정상 소비 이후 같은 state를 순차적으로 다시 쓰면 실제 consumeOAuthState가 거부한다", async (t) => {
    const fake = withFakeRepository(t);
    const { rawState, browserFingerprint } = await issueState(fake);

    const first = await socialAuthService.consumeOAuthState(rawState, { browserFingerprint, purpose: "login" });
    assert.equal(first.purpose, "login");

    await assert.rejects(
        socialAuthService.consumeOAuthState(rawState, { browserFingerprint, purpose: "login" }),
        (error) => error.status === 409 && error.code === "STATE_REUSED",
    );
});

// ── AC-04/D-01: 실제 resolveOAuthAccount의 자동 병합 금지 ───────────────────────

test("같은 이메일의 기존 계정이 있으면 실제 resolveOAuthAccount가 EMAIL_CONFLICT로 거부하고 자동으로 병합·세션 발급하지 않는다", async (t) => {
    const fake = withFakeRepository(t);
    fake.__seedExistingUser({ uuid: "existing-uuid", email: "conflict@example.com", nickname: "기존유저" });
    const sessionCalls = withIssueSessionSpy(t);

    await assert.rejects(
        socialAuthService.resolveOAuthAccount({
            provider: "google", subject: "new-google-subject", email: "conflict@example.com",
            cancelled: false, rememberMe: false, reqInfo: {},
        }),
        (error) => error.status === 409 && error.code === "EMAIL_CONFLICT",
    );

    assert.equal(sessionCalls.length, 0, "이메일 충돌은 어떤 계정으로도 세션을 발급하면 안 됩니다(자동 병합 금지)");
    const identity = await userRepository.findExternalIdentity({ provider: "google", subject: "new-google-subject" });
    assert.equal(identity, null, "이메일 충돌은 새 provider identity를 만들면 안 됩니다");
});

test("이미 연결된 identity로 재로그인하면 실제 resolveOAuthAccount가 그 계정으로만 정확히 한 번 세션을 발급한다", async (t) => {
    const fake = withFakeRepository(t);
    fake.__seedExistingUser({ uuid: "linked-uuid", email: "linked@example.com", nickname: "연결유저" });
    await fake.createExternalIdentity({ provider: "google", subject: "linked-subject", user_id: "linked-uuid" });
    const sessionCalls = withIssueSessionSpy(t);

    const result = await socialAuthService.resolveOAuthAccount({
        provider: "google", subject: "linked-subject", email: "linked@example.com",
        cancelled: false, rememberMe: true, reqInfo: {},
    });

    assert.equal(result.status, "LOGIN");
    assert.equal(result.user.uuid, "linked-uuid");
    assert.equal(sessionCalls.length, 1, "재로그인은 정확히 한 번만 세션을 발급해야 합니다(이중 발급 금지)");
    assert.equal(sessionCalls[0][1].rememberMe, true);
});
