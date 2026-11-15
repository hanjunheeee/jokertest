'use strict';

// 관리자 세션 시험: 가만히 30분이면 로그아웃, 자동 새로고침은 활동 아님, 손으로 누르면 늘어남, 최대 12시간, 로그아웃, 계정 끄면 세션도 끝
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-132~139 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
// 시간은 세션 줄(admin_sessions) 시각을 앞으로 당겨 흐른 것처럼 함 (기다리지 않음)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../models');
const { prepareAdminDb, startAdminServer, createAgent, randomIp } = require('./helpers/adminTestApp');
const { setAdminActive } = require('../../admin/scripts/admin-account');
const G = require('./a14-gate-helpers');

const { MINUTE } = G;
const ME = '/admin-api/auth/me';
const BACKGROUND = { 'x-admin-background': '1' };

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 test:with-db·with-lock.sh testdb로 돌림');
    return true;
};

let prepared = null;
let server = null;
let restoreEnv = null;
test.before(async () => {
    if (!TEST_DB_URL) return;
    restoreEnv = G.gateEnv();
    prepared = await prepareAdminDb();
    server = await startAdminServer();
});
test.after(async () => {
    if (server) await server.close();
    if (restoreEnv) restoreEnv();
    if (prepared) await prepared.close();
    else await db.sequelize.close();
});

// 로그인한 관리자 → { admin, agent, raw(쿠키 원문), sessionId }
const loggedIn = async (tag) => {
    const admin = await G.makeAdmin(tag);
    const agent = createAgent({ url: server.url, ip: randomIp() });
    const res = await G.goodLogin(agent, admin);
    assert.equal(res.status, 200, `로그인 ${res.status} ${res.body?.code}`);
    agent.csrfToken = res.body.csrfToken;
    const raw = agent.jar.get('mmc_admin_sid');
    return { admin, agent, raw, sessionId: G.sessionIdOf(raw) };
};

// 세션 줄 시각 셋을 같이 당기는 시계 (기준 = anchorMs, 안 주면 로그인 때 시각 DB 값)
const sessionClock = async (sessionId, anchorMs) => {
    const row = await db.AdminSession.findByPk(sessionId, { raw: true });
    return G.virtualClock({
        anchorMs: anchorMs ?? new Date(row.created_at).getTime(),
        shift: (sec) => G.shiftColumns(db.sequelize, 'admin_sessions', ['created_at', 'last_seen_at', 'expires_at'], 'id = :id', { id: sessionId }, sec),
    });
};

const assertExpired = (res) => {
    assert.equal(res.status, 401, `상태 ${res.status} ${res.body?.code}`);
    assert.equal(res.body.code, 'ADMIN_SESSION_EXPIRED');
};

test('A14-B-132 마지막 활동 29분 59초 전 → 200', async (t) => {
    if (noDb(t)) return;
    const s = await loggedIn('idle2959');
    const clock = await sessionClock(s.sessionId);
    await clock.to(29 * MINUTE + 59 * 1000, 'atMost');
    assert.equal((await s.agent.get(ME)).status, 200);
});

test('A14-B-133 마지막 활동 30분 전 → 401 ADMIN_SESSION_EXPIRED', async (t) => {
    if (noDb(t)) return;
    const s = await loggedIn('idle30');
    const clock = await sessionClock(s.sessionId);
    await clock.to(30 * MINUTE, 'atLeast');
    assertExpired(await s.agent.get(ME));
});

test('A14-B-134 25분 동안 X-Admin-Background: 1 요청만 → 30분째 401', async (t) => {
    if (noDb(t)) return;
    const s = await loggedIn('bg');
    const clock = await sessionClock(s.sessionId);
    for (const minute of [5, 10, 15, 20, 25]) {
        await clock.to(minute * MINUTE, 'atMost');
        const res = await s.agent.get(ME, { headers: BACKGROUND });
        assert.equal(res.status, 200, `${minute}분째 자동 새로고침`);
    }
    await clock.to(30 * MINUTE, 'atLeast');
    assertExpired(await s.agent.get(ME, { headers: BACKGROUND }));
});

test('A14-B-135 25분째 보통 요청 → 그 뒤 29분 59초째 200', async (t) => {
    if (noDb(t)) return;
    const s = await loggedIn('touch');
    const clock = await sessionClock(s.sessionId);
    await clock.to(25 * MINUTE, 'atMost');
    const touchedAt = Date.now();
    assert.equal((await s.agent.get(ME)).status, 200, '25분째 보통 요청');
    // 기준을 그 보통 요청 시각으로 새로
    const after = await sessionClock(s.sessionId, touchedAt);
    await after.to(29 * MINUTE + 59 * 1000, 'atMost');
    assert.equal((await s.agent.get(ME)).status, 200);
});

// 25분마다 보통 요청으로 계속 활동 (로그인 뒤 untilMs까지)
const keepActive = async (s, clock, untilMs) => {
    for (let at = 25 * MINUTE; at <= untilMs; at += 25 * MINUTE) {
        await clock.to(at, 'atMost');
        const res = await s.agent.get(ME);
        assert.equal(res.status, 200, `로그인 뒤 ${at / MINUTE}분 활동`);
    }
};

test('A14-B-136 계속 활동, 로그인 뒤 11시간 59분 → 200', async (t) => {
    if (noDb(t)) return;
    const s = await loggedIn('max1159');
    const clock = await sessionClock(s.sessionId);
    await keepActive(s, clock, 11 * 60 * MINUTE + 40 * MINUTE);
    await clock.to(11 * 60 * MINUTE + 59 * MINUTE, 'atMost');
    assert.equal((await s.agent.get(ME)).status, 200);
});

test('A14-B-137 계속 활동, 로그인 뒤 12시간 → 401 ADMIN_SESSION_EXPIRED', async (t) => {
    if (noDb(t)) return;
    const s = await loggedIn('max12');
    const clock = await sessionClock(s.sessionId);
    await keepActive(s, clock, 11 * 60 * MINUTE + 40 * MINUTE);
    await clock.to(12 * 60 * MINUTE, 'atLeast');
    assertExpired(await s.agent.get(ME));
});

test('A14-B-138 로그아웃 → 쿠키 지움, 같은 쿠키로 다시 → 401, revoked_at 채움, 기록 ADMIN_LOGOUT', async (t) => {
    if (noDb(t)) return;
    const s = await loggedIn('logout');
    const res = await s.agent.post('/admin-api/auth/logout', {});
    assert.equal(res.status, 200);
    const cleared = res.setCookies.find((line) => line.startsWith('mmc_admin_sid='));
    assert.ok(cleared, '쿠키 지우는 줄');
    assert.match(cleared, /^mmc_admin_sid=;|expires=thu, 01 jan 1970|max-age=0/i);
    const again = await createAgent({ url: server.url, ip: randomIp() }).get(ME, { headers: { cookie: `mmc_admin_sid=${s.raw}` } });
    assert.equal(again.status, 401);
    const row = await db.AdminSession.findByPk(s.sessionId, { raw: true });
    assert.ok(row.revoked_at, 'revoked_at 채움');
    const logs = await db.AdminAuditLog.findAll({ where: { admin_id: s.admin.id, action: 'ADMIN_LOGOUT' }, raw: true });
    assert.equal(logs.length, 1);
});

test('A14-B-139 로그인한 채 계정 disable → 다음 요청 401', async (t) => {
    if (noDb(t)) return;
    const s = await loggedIn('disable');
    assert.equal((await s.agent.get(ME)).status, 200);
    await setAdminActive({ loginId: s.admin.loginId, active: false });
    assert.equal((await s.agent.get(ME)).status, 401);
});
