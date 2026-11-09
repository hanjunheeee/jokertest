'use strict';

// 로그인 잠깐 막기 통합 시험 (AD-020·021·022), 셈은 DB 표 admin_login_attempts → Node 여러 개도 같은 수
// npm run test:with-db -- tests/admin/loginLock.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
    prepareAdminDb, createTestAdmin, createAgent, startAdminServer, randomIp, otpNow, setEnv,
    TEST_TOTP_KEY, TEST_ORIGIN,
} = require('./helpers/adminTestApp');

let dbHandle = null;
let restoreEnv = () => {};
test.before(async () => {
    restoreEnv = setEnv({ ADMIN_TOTP_KEY: TEST_TOTP_KEY, ADMIN_ORIGIN: TEST_ORIGIN, ADMIN_ACCESS_MODE: 'off' });
    dbHandle = await prepareAdminDb();
});
test.after(async () => {
    restoreEnv();
    if (dbHandle) await dbHandle.close();
});

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const { login } = require('../../admin/services/core/login');
const db = () => require('../../models');

const MINUTE = 60 * 1000;
// 가짜 시계: 지금보다 하루 뒤부터 (다른 시험 줄과 안 섞이게 시험마다 다른 날), 초 단위로 맞춤 (DB 시각 칸이 초까지라)
let dayOffset = 1;
const clockFrom = () => {
    dayOffset += 1;
    return Math.floor((Date.now() + dayOffset * 24 * 60 * MINUTE) / 1000) * 1000;
};

const tryLogin = (account, { atMs, ip, password, otp }) => login({
    loginId: account.loginId,
    password: password ?? account.password,
    otp: otp ?? otpNow(account.totpSecret, atMs),
    ip,
    accessEmail: null,
    userAgent: 'test',
    now: new Date(atMs),
});

const expectCode = async (promise, status, code) => {
    await assert.rejects(promise, (error) => {
        assert.equal(error.status, status);
        assert.equal(error.code, code);
        return true;
    });
};

test('AD-020: 같은 아이디 15분 안 5번 틀림 → 맞아도 429 ADMIN_LOGIN_LOCKED { retryAfterSec }, 15분 뒤 풀림', async (t) => {
    if (skipWithoutDb(t)) return;
    const admin = await createTestAdmin();
    const start = clockFrom();
    for (let i = 0; i < 4; i += 1) {
        await expectCode(tryLogin(admin, { atMs: start + i * MINUTE, ip: randomIp(), password: 'wrong-password-123' }), 401, 'ADMIN_LOGIN_FAILED');
    }
    // 4번까진 맞으면 들어감 → 이번엔 5번째도 틀림
    const lastFailAt = start + 10 * MINUTE;
    await expectCode(tryLogin(admin, { atMs: lastFailAt, ip: randomIp(), password: 'wrong-password-123' }), 401, 'ADMIN_LOGIN_FAILED');

    const lockedAt = lastFailAt + 2 * MINUTE;
    await assert.rejects(tryLogin(admin, { atMs: lockedAt, ip: randomIp() }), (error) => {
        assert.equal(error.status, 429);
        assert.equal(error.code, 'ADMIN_LOGIN_LOCKED');
        assert.equal(error.details.retryAfterSec, 13 * 60);
        return true;
    });
    const rows = await db().AdminLoginAttempt.findAll({ where: { login_id: admin.loginId }, order: [['id', 'ASC']], raw: true });
    assert.equal(rows.at(-1).failure_code, 'LOCKED');

    // 막힌 동안 틀린 시도(LOCKED)는 막는 시간을 안 늘림 → 마지막 틀림 + 15분 뒤 풀림
    await expectCode(tryLogin(admin, { atMs: lastFailAt + 14 * MINUTE, ip: randomIp() }), 429, 'ADMIN_LOGIN_LOCKED');
    const ok = await tryLogin(admin, { atMs: lastFailAt + 15 * MINUTE + 1000, ip: randomIp() });
    assert.equal(ok.admin.id, admin.id);
});

test('AD-020: 15분보다 넓게 흩어진 5번 틀림은 안 막힘, 성공하면 셈 다시', async (t) => {
    if (skipWithoutDb(t)) return;
    const admin = await createTestAdmin();
    const start = clockFrom();
    for (let i = 0; i < 5; i += 1) {
        await expectCode(tryLogin(admin, { atMs: start + i * 4 * MINUTE, ip: randomIp(), password: 'wrong-password-123' }), 401, 'ADMIN_LOGIN_FAILED');
    }
    // 첫 틀림 0분 ~ 다섯째 16분 → 15분 안 5번 아님
    const ok = await tryLogin(admin, { atMs: start + 17 * MINUTE, ip: randomIp() });
    assert.equal(ok.admin.id, admin.id);
    // 성공 뒤엔 새로 셈: 4번 더 틀려도 안 막힘
    for (let i = 0; i < 4; i += 1) {
        await expectCode(tryLogin(admin, { atMs: start + 18 * MINUTE + i * 1000, ip: randomIp(), password: 'wrong-password-123' }), 401, 'ADMIN_LOGIN_FAILED');
    }
    const again = await tryLogin(admin, { atMs: start + 19 * MINUTE, ip: randomIp() });
    assert.equal(again.admin.id, admin.id);
});

test('AD-021: 같은 IP 15분 안 20번 틀림 → 429 (다른 아이디여도), 다른 IP는 통과', async (t) => {
    if (skipWithoutDb(t)) return;
    const admin = await createTestAdmin();
    const start = clockFrom();
    const ip = randomIp();
    for (let i = 0; i < 20; i += 1) {
        const stranger = { loginId: `guess-${start}-${i}`, password: 'wrong-password-123', totpSecret: admin.totpSecret };
        await expectCode(tryLogin(stranger, { atMs: start + i * 1000, ip }), 401, 'ADMIN_LOGIN_FAILED');
    }
    await assert.rejects(tryLogin(admin, { atMs: start + 30 * 1000, ip }), (error) => {
        assert.equal(error.code, 'ADMIN_LOGIN_LOCKED');
        assert.equal(error.details.retryAfterSec, 15 * 60 - 11);
        return true;
    });
    const fromElsewhere = await tryLogin(admin, { atMs: start + 31 * 1000, ip: randomIp() });
    assert.equal(fromElsewhere.admin.id, admin.id);
});

// 관리자 코드만 새로 읽은 두 번째 Node (메모리는 따로, DB는 같음)
const startSecondNode = async () => {
    const adminDir = path.join(__dirname, '../../admin') + path.sep;
    const saved = {};
    for (const key of Object.keys(require.cache)) {
        if (key.startsWith(adminDir)) {
            saved[key] = require.cache[key];
            delete require.cache[key];
        }
    }
    try {
        return await startAdminServer();
    } finally {
        Object.assign(require.cache, saved);
    }
};

test('AD-022: Node 둘(같은 DB) — n1 3번 + n2 2번 틀림 → 잠김', async (t) => {
    if (skipWithoutDb(t)) return;
    const n1 = await startAdminServer();
    const n2 = await startSecondNode();
    t.after(async () => { await n1.close(); await n2.close(); });
    const admin = await createTestAdmin();
    const wrong = { ...admin, password: 'wrong-password-123' };
    const a1 = createAgent({ url: n1.url, ip: randomIp() });
    const a2 = createAgent({ url: n2.url, ip: randomIp() });
    for (let i = 0; i < 3; i += 1) assert.equal((await a1.login(wrong)).status, 401);
    for (let i = 0; i < 2; i += 1) assert.equal((await a2.login(wrong)).status, 401);
    const res = await a1.login(admin);
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'ADMIN_LOGIN_LOCKED');
    assert.ok(res.body.retryAfterSec > 14 * 60 && res.body.retryAfterSec <= 15 * 60);
    assert.equal((await a2.login(admin)).status, 429);
});
