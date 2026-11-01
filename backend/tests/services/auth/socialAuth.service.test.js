process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

const test   = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const userRepository = require("../../../repositories/user.repositories");
const authService    = require("../../../services/auth/account");
const socialAuthService = require("../../../services/auth/social");

const hashValue = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

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
    const oauthStates = new Map();
    let nextStateId = 1;
    const usersByUuid = new Map();
    const usersByEmail = new Map();
    const externalIdentities = new Map();
    const socialSignupIntents = new Map();
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
