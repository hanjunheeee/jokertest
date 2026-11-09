'use strict';

// 제재 이상한 순서·동시 시험 파일, 관리자 둘이 같은 회원을 동시에 정지·해제·기간 바꾸기 + 정지와 로그인·탈퇴가 겹칠 때
// 진짜 시험 DB + 관리자 라우터 + 진짜 플레이어 로그인, 초 경계(DATETIME 소수 초)는 시각을 넣어 정확히 봄
// npm run test:with-db -- tests/admin/sanctions.odd.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-sanctions-odd-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb, adminTestApp, createTestAdmin, createAgent, randomIp } = require('./helpers/adminTestApp');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => { if (dbHandle) await dbHandle.close(); });

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');
const PASSWORD = 'player-password-1234';
const REQ_INFO = { ip: '10.0.0.1', userAgent: 'odd', deviceType: 'PC' };
const HOUR = 60 * 60 * 1000;

// 로그인할 수 있는 플레이어 하나
const makePlayer = async () => {
    const { hashPassword } = require('../../utils/auth/credentials');
    const tag = crypto.randomBytes(3).toString('hex');
    return db().User.create({
        uuid: crypto.randomUUID(), password_hash: await hashPassword(PASSWORD), nickname: `이상${tag}`, email: `odd-ban-${tag}@example.com`,
    });
};

// 진짜 로그인 → { status, token } (실패는 던진 오류 상태)
const playerLogin = async (player) => {
    const account = require('../../services/auth/account');
    try {
        const { token } = await account.login({ email: player.email, password: PASSWORD }, REQ_INFO);
        return { status: 200, token };
    } catch (error) {
        return { status: error.status ?? 500, message: error.message };
    }
};

// 토큰 세션이 지금 쓸 수 있는지 (세션 확인 그대로)
const sessionOk = async (token) => {
    const lifecycle = require('../../services/auth/sessionLifecycle');
    const result = await lifecycle.resolveSession(lifecycle.verifyAccessToken(token));
    return result.ok;
};

// 같은 시험 서버에 둘째 관리자 로그인 → 요청 도구
const secondAdmin = async (url) => {
    const account = await createTestAdmin();
    const agent = createAgent({ url, ip: randomIp() });
    const res = await agent.login(account);
    assert.equal(res.status, 200, `둘째 관리자 로그인 ${res.status}`);
    return { agent, account };
};

// 두 관리자 준비 → { a, b, adminA, adminB }
const twoAdmins = async (t) => {
    const first = await adminTestApp({ t });
    const other = await secondAdmin(first.url);
    return { a: first.agent, b: other.agent, adminA: first.admin, adminB: other.account };
};

// 지금 초의 몇 ms 자리에 올 때까지 기다림 (시계 자리 확인, 정해진 시간 재우기 아님)
// DATETIME은 소수 초를 반올림함 → 앞쪽(0~300)이면 내림, 뒤쪽(600~900)이면 올림이 남
const waitMsInSecond = async (from, to) => {
    for (;;) {
        const ms = Date.now() % 1000;
        if (ms >= from && ms < to) return;
        const gap = ms < from ? from - ms : 1000 - ms + from;
        await new Promise((resolve) => setTimeout(resolve, gap));
    }
};

// 2초 전 X.700 같은 시각 (지난 시각이라 실제 시계와 안 겹침, 소수 자리만 정해 둠)
const pastAtMs = (ms) => new Date((Math.floor(Date.now() / 1000) - 2) * 1000 + ms);

const logsOf = (action, targetId) => db().AdminAuditLog.findAll({ where: { action, target_id: targetId }, raw: true });
const bansOf = (uuid) => db().UserBan.findAll({ where: { user_id: uuid }, order: [['id', 'ASC']], raw: true });
const activeBan = (uuid) => require('../../repositories/user/loginGuard').checkActiveBan(uuid);
const reqOf = (admin) => ({ admin: { id: admin.id }, adminRequestMeta: { ip: '10.9.9.9', accessEmail: null } });

// 한 시간 전부터 걸린 영구 정지 줄 (해제 시험 바탕)
const seedBan = (player, admin) => db().UserBan.create({
    user_id: player.uuid, reason: '욕설', banned_by: admin.id, start_at: new Date(Date.now() - HOUR), created_at: new Date(), is_permanent: true, end_at: null,
});

// ── 동시 정지·해제 ──

test('[동시] 관리자 둘이 같은 회원을 같은 순간 정지 → 하나만 201, 다른 쪽 409 ALREADY_BANNED, 정지 줄·BAN 기록 하나', async (t) => {
    if (skipWithoutDb(t)) return;
    const { a, b } = await twoAdmins(t);
    const player = await makePlayer();
    // 초 앞쪽에서 보냄 (소수 초 반올림 영향 빼고 동시만 봄)
    await waitMsInSecond(0, 300);
    const [ra, rb] = await Promise.all([
        a.post(`/admin-api/members/${player.uuid}/bans`, { kind: 'PERIOD', days: 3, reason: '욕설' }),
        b.post(`/admin-api/members/${player.uuid}/bans`, { kind: 'PERMANENT', reason: '도배' }),
    ]);
    assert.deepEqual([ra.status, rb.status].sort(), [201, 409], JSON.stringify([ra.body, rb.body]));
    const lost = ra.status === 409 ? ra : rb;
    assert.equal(lost.body.code, 'ALREADY_BANNED');
    assert.equal((await bansOf(player.uuid)).length, 1);
    assert.equal((await logsOf('BAN', player.uuid)).length, 1);
});

test('[동시+시간 경계] 초 끝자락(0.6~0.9초)에 관리자 둘이 같은 회원 정지 → 그래도 정지 줄·BAN 기록 하나', async (t) => {
    if (skipWithoutDb(t)) return;
    const { a, b } = await twoAdmins(t);
    const player = await makePlayer();
    await waitMsInSecond(600, 750);
    const results = await Promise.all([
        a.post(`/admin-api/members/${player.uuid}/bans`, { kind: 'PERIOD', days: 3, reason: '욕설' }),
        b.post(`/admin-api/members/${player.uuid}/bans`, { kind: 'PERIOD', days: 7, reason: '도배' }),
    ]);
    assert.deepEqual(results.map((res) => res.status).sort(), [201, 409], JSON.stringify(results.map((res) => res.body)));
    assert.equal((await bansOf(player.uuid)).length, 1, '정지 줄이 둘 생기면 안 됨');
    assert.equal((await logsOf('BAN', player.uuid)).length, 1);
});

test('[동시] 관리자 둘이 같은 회원을 같은 순간 해제 → 하나만 200, 다른 쪽 409 NOT_BANNED, UNBAN 기록 하나', async (t) => {
    if (skipWithoutDb(t)) return;
    const { a, b, adminA } = await twoAdmins(t);
    const player = await makePlayer();
    await seedBan(player, adminA);
    await waitMsInSecond(600, 750);
    const results = await Promise.all([
        a.post(`/admin-api/members/${player.uuid}/unban`, { reason: '이의 신청' }),
        b.post(`/admin-api/members/${player.uuid}/unban`, { reason: '오해였음' }),
    ]);
    assert.deepEqual(results.map((res) => res.status).sort(), [200, 409], JSON.stringify(results.map((res) => res.body)));
    assert.equal(results.find((res) => res.status === 409).body.code, 'NOT_BANNED');
    assert.equal((await logsOf('UNBAN', player.uuid)).length, 1, '해제 기록은 하나');
});

// ── 이미 처리된 것 또 하기 (초 경계, 시각을 넣어 정확히) ──

test('[시간 경계] X.700초에 해제 → 저장된 끝 시각이 해제 시각보다 늦지 않음 (반올림으로 정지가 더 살아 있으면 안 됨)', async (t) => {
    if (skipWithoutDb(t)) return;
    const { admin } = await adminTestApp({ t });
    const { unbanMember } = require('../../admin/services/sanctions/unban');
    const player = await makePlayer();
    const ban = await seedBan(player, admin);
    const now = pastAtMs(700);
    await unbanMember({ req: reqOf(admin), uuid: player.uuid, reason: '풀기' }, { now });
    const row = await db().UserBan.findByPk(ban.id, { raw: true });
    assert.ok(new Date(row.end_at).getTime() <= now.getTime(), `끝 시각 ${new Date(row.end_at).toISOString()} > 해제 시각 ${now.toISOString()}`);
});

test('[이상한 순서+시간 경계] X.700초 해제 뒤 0.1초 늦게 다른 관리자가 또 해제 → 409 NOT_BANNED, 해제한 사람·기록 그대로', async (t) => {
    if (skipWithoutDb(t)) return;
    const { admin } = await adminTestApp({ t });
    const other = await createTestAdmin();
    const { unbanMember } = require('../../admin/services/sanctions/unban');
    const player = await makePlayer();
    const ban = await seedBan(player, admin);
    const first = pastAtMs(700);
    await unbanMember({ req: reqOf(admin), uuid: player.uuid, reason: '먼저 풂' }, { now: first });
    await assert.rejects(
        unbanMember({ req: reqOf(other), uuid: player.uuid, reason: '또 풂' }, { now: new Date(first.getTime() + 100) }),
        (error) => error.code === 'NOT_BANNED',
    );
    const row = await db().UserBan.findByPk(ban.id, { raw: true });
    assert.equal(row.lifted_by, admin.id, '먼저 푼 관리자가 남아야 함');
    assert.equal(row.lift_reason, '먼저 풂');
    assert.equal((await logsOf('UNBAN', player.uuid)).length, 1);
});

test('[시간 경계] X.700초에 정지 → 저장된 시작 시각이 정지 시각보다 늦지 않음 (정지가 바로 걸려야 함)', async (t) => {
    if (skipWithoutDb(t)) return;
    const { admin } = await adminTestApp({ t });
    const { banMember } = require('../../admin/services/sanctions/ban');
    const player = await makePlayer();
    const now = pastAtMs(700);
    const { ban } = await db().sequelize.transaction((transaction) => banMember(
        { req: reqOf(admin), uuid: player.uuid, kind: 'PERIOD', days: 1, reason: '욕설' }, { transaction, now },
    ));
    const row = await db().UserBan.findByPk(ban.id, { raw: true });
    assert.ok(new Date(row.start_at).getTime() <= now.getTime(), `시작 시각 ${new Date(row.start_at).toISOString()} > 정지 시각 ${now.toISOString()}`);
});

test('[이상한 순서+시간 경계] X.700초 정지 뒤 0.1초 늦게 다른 관리자가 또 정지 → 409 ALREADY_BANNED, 정지 줄 하나', async (t) => {
    if (skipWithoutDb(t)) return;
    const { admin } = await adminTestApp({ t });
    const other = await createTestAdmin();
    const { banMember } = require('../../admin/services/sanctions/ban');
    const player = await makePlayer();
    const first = pastAtMs(700);
    await db().sequelize.transaction((transaction) => banMember(
        { req: reqOf(admin), uuid: player.uuid, kind: 'PERIOD', days: 1, reason: '욕설' }, { transaction, now: first },
    ));
    await assert.rejects(
        db().sequelize.transaction((transaction) => banMember(
            { req: reqOf(other), uuid: player.uuid, kind: 'PERMANENT', reason: '또 정지' }, { transaction, now: new Date(first.getTime() + 100) },
        )),
        (error) => error.code === 'ALREADY_BANNED',
    );
    assert.equal((await bansOf(player.uuid)).length, 1, '정지 줄이 둘 생기면 안 됨');
});

test('[시간 경계] 초 끝자락에 해제하고 바로 로그인 → 정지 판정 없음·로그인 200', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const player = await makePlayer();
    await seedBan(player, admin);
    await waitMsInSecond(600, 700);
    const res = await agent.post(`/admin-api/members/${player.uuid}/unban`, { reason: '풀기' });
    assert.equal(res.status, 200);
    assert.equal(await activeBan(player.uuid), null, '해제 응답 뒤에도 정지 중으로 보임');
    assert.equal((await playerLogin(player)).status, 200);
});

test('[시간 경계] 초 끝자락에 정지하고 바로 로그인 → 403 (정지 응답 뒤 들어오면 안 됨)', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const player = await makePlayer();
    await waitMsInSecond(600, 700);
    const res = await agent.post(`/admin-api/members/${player.uuid}/bans`, { kind: 'PERIOD', days: 1, reason: '욕설' });
    assert.equal(res.status, 201);
    const login = await playerLogin(player);
    assert.equal(login.status, 403, `정지 바로 뒤 로그인 ${login.status}`);
});

// ── 서로 다른 조작이 겹침 ──

test('[동시] 관리자 A 정지 · 관리자 B 해제가 같은 순간 → 500 없음, 끝 상태가 기록과 맞음', async (t) => {
    if (skipWithoutDb(t)) return;
    const { a, b } = await twoAdmins(t);
    const player = await makePlayer();
    await waitMsInSecond(0, 300);
    const [ban, unban] = await Promise.all([
        a.post(`/admin-api/members/${player.uuid}/bans`, { kind: 'PERIOD', days: 3, reason: '욕설' }),
        b.post(`/admin-api/members/${player.uuid}/unban`, { reason: '풀기' }),
    ]);
    assert.equal(ban.status, 201, JSON.stringify(ban.body));
    assert.ok([200, 409].includes(unban.status), JSON.stringify(unban.body));
    const stillBanned = Boolean(await activeBan(player.uuid));
    // 해제가 이겼으면(200) 정지 없음·UNBAN 기록 하나, 졌으면(409) 정지 중·UNBAN 기록 없음
    assert.equal(stillBanned, unban.status === 409);
    assert.equal((await logsOf('UNBAN', player.uuid)).length, unban.status === 200 ? 1 : 0);
});

test('[이상한 순서+동시] 관리자 A 기간 바꾸기 · 관리자 B 해제가 같은 순간 → 끝엔 정지 없음 (해제 뒤 바꾸기는 409 NOT_BANNED)', async (t) => {
    if (skipWithoutDb(t)) return;
    const { a, b, adminA } = await twoAdmins(t);
    const player = await makePlayer();
    const ban = await seedBan(player, adminA);
    await waitMsInSecond(600, 750);
    const [patch, unban] = await Promise.all([
        a.request('PATCH', `/admin-api/members/${player.uuid}/bans/${ban.id}`, { body: { kind: 'PERIOD', days: 30, reason: '늘림' } }),
        b.post(`/admin-api/members/${player.uuid}/unban`, { reason: '풀기' }),
    ]);
    assert.equal(unban.status, 200, JSON.stringify(unban.body));
    assert.ok([200, 409].includes(patch.status), JSON.stringify(patch.body));
    if (patch.status === 409) assert.equal(patch.body.code, 'NOT_BANNED');
    assert.equal(await activeBan(player.uuid), null, '해제가 끝난 뒤 기간 바꾸기가 정지를 되살리면 안 됨');
});

test('[동시] 정지와 플레이어 로그인 6번이 같은 순간 → 정지 커밋 뒤엔 어느 세션도 못 씀', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const player = await makePlayer();
    await waitMsInSecond(0, 200);
    const [ban, ...logins] = await Promise.all([
        agent.post(`/admin-api/members/${player.uuid}/bans`, { kind: 'PERIOD', days: 1, reason: '욕설' }),
        ...Array.from({ length: 6 }, () => playerLogin(player)),
    ]);
    assert.equal(ban.status, 201);
    for (const login of logins) assert.ok([200, 403].includes(login.status), `로그인 ${login.status} ${login.message ?? ''}`);
    for (const login of logins.filter((one) => one.status === 200)) {
        assert.equal(await sessionOk(login.token), false, '정지 뒤 살아 있는 세션');
    }
    const alive = await db().UserSession.count({ where: { user_id: player.uuid, is_online: true, revoked_at: null } });
    assert.equal(alive, 0, '세션 확인 뒤 살아 있는 세션 줄이 남음');
});

test('[동시] 관리자 정지와 플레이어 탈퇴가 같은 순간 → 500 없음, 탈퇴됨, 정지는 201 또는 409 MEMBER_WITHDRAWN', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const account = require('../../services/auth/account');
    const player = await makePlayer();
    const [ban, withdraw] = await Promise.all([
        agent.post(`/admin-api/members/${player.uuid}/bans`, { kind: 'PERMANENT', reason: '욕설' }),
        account.withdrawAccount({ uuid: player.uuid, password: PASSWORD }).then((value) => ({ ok: true, value }), (error) => ({ ok: false, error })),
    ]);
    assert.equal(withdraw.ok, true, withdraw.error?.message);
    assert.ok(ban.status === 201 || (ban.status === 409 && ban.body.code === 'MEMBER_WITHDRAWN'), JSON.stringify(ban.body));
    const row = await db().User.findOne({ where: { uuid: player.uuid }, paranoid: false, raw: true });
    assert.equal(row.status, 'WITHDRAWN');
    assert.equal((await playerLogin(player)).status, 401, '탈퇴한 옛 이메일로 로그인 안 됨');
});
