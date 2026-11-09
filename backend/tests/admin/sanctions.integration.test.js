'use strict';

// 제재 통합 시험 (AD-070~079), 진짜 시험 DB + 관리자 라우터 + 진짜 즉시 끊기(소켓만 가짜) + 진짜 플레이어 로그인
// npm run test:with-db -- tests/admin/sanctions.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-sanctions-integration-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb, adminTestApp } = require('./helpers/adminTestApp');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => { if (dbHandle) await dbHandle.close(); });

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');
const emitter = () => require('../../socket/emitter');
const PASSWORD = 'player-password-1234';
const DAY = 24 * 60 * 60 * 1000;

// 로그인할 수 있는 플레이어 하나
const makePlayer = async () => {
    const { hashPassword } = require('../../utils/auth/credentials');
    const tag = crypto.randomBytes(3).toString('hex');
    return db().User.create({
        uuid: crypto.randomUUID(), password_hash: await hashPassword(PASSWORD), nickname: `제재${tag}`, email: `ban-${tag}@example.com`,
    });
};

// 진짜 플레이어 로그인 → 상태 숫자 (성공 200, 실패는 던진 오류의 상태)
const playerLogin = async (player) => {
    const account = require('../../services/auth/account');
    try {
        await account.login({ email: player.email, password: PASSWORD }, { ip: '10.0.0.1', userAgent: 'test', deviceType: 'PC' });
        return 200;
    } catch (error) {
        return error.status;
    }
};

// 이 Node 소켓 흉내 (계정 채널에 든 채로), io를 끼워 두고 시험 끝에 뺌
const plugSockets = (t, players) => {
    const sockets = players.map((player, index) => ({
        id: `s-${index}`,
        rooms: new Set([`user:${player.uuid}`]),
        emitted: [],
        disconnected: false,
        emit(event, payload) { this.emitted.push({ event, payload }); },
        disconnect() { this.disconnected = true; },
    }));
    emitter().setIo({ in: (channel) => ({ fetchSockets: async () => sockets.filter((socket) => socket.rooms.has(channel)) }) });
    t.after(() => emitter().setIo(null));
    return sockets;
};

const logsOf = (action, targetId) => db().AdminAuditLog.findAll({ where: { action, target_id: targetId }, order: [['id', 'ASC']], raw: true });
const parse = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

test('AD-070: 강제 접속 종료 → force_disconnect ADMIN_DISCONNECT, 다시 로그인 됨, 기록 FORCE_DISCONNECT', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const player = await makePlayer();
    const [socket] = plugSockets(t, [player]);
    const res = await agent.post(`/admin-api/members/${player.uuid}/force-disconnect`, { reason: '게임 멈춤 신고' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, disconnected: 1, partial: false });
    assert.equal(socket.disconnected, true);
    assert.equal(socket.emitted[0].event, 'force_disconnect');
    assert.equal(socket.emitted[0].payload.code, 'ADMIN_DISCONNECT');
    assert.equal(await playerLogin(player), 200);
    const logs = await logsOf('FORCE_DISCONNECT', player.uuid);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].admin_id, admin.id);
    assert.equal(logs[0].reason, '게임 멈춤 신고');
    assert.equal(parse(logs[0].after_value).disconnected, 1);
});

test('AD-071: 기간 정지 → user_bans(banned_by·reason·end_at), 접속 중이면 ACCOUNT_BANNED로 끊김, 로그인 403, 기록 BAN', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const player = await makePlayer();
    const [socket] = plugSockets(t, [player]);
    const started = Date.now();
    const res = await agent.post(`/admin-api/members/${player.uuid}/bans`, { kind: 'PERIOD', days: 7, reason: '욕설' });
    assert.equal(res.status, 201);
    assert.equal(res.body.ban.reason, '욕설');
    assert.equal(res.body.ban.isPermanent, false);
    assert.deepEqual(res.body.disconnect, { disconnected: 1, partial: false });
    assert.equal(socket.emitted[0].payload.code, 'ACCOUNT_BANNED');

    const row = await db().UserBan.findOne({ where: { user_id: player.uuid }, raw: true });
    assert.equal(row.banned_by, admin.id);
    assert.equal(row.reason, '욕설');
    const length = new Date(row.end_at) - new Date(row.start_at);
    assert.ok(Math.abs(length - 7 * DAY) < 2000, '끝 시각 = 시작 + 7일');
    assert.ok(new Date(row.start_at).getTime() >= started - 2000);
    assert.equal(await playerLogin(player), 403);

    const [log] = await logsOf('BAN', player.uuid);
    assert.equal(log.reason, '욕설');
    assert.equal(log.before_value, null);
    assert.equal(parse(log.after_value).ban.id, row.id);
});

test('AD-072: 기간 끝나면 다시 로그인 됨', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const player = await makePlayer();
    await agent.post(`/admin-api/members/${player.uuid}/bans`, { kind: 'PERIOD', days: 1, reason: '도배' });
    assert.equal(await playerLogin(player), 403);
    await db().UserBan.update({ start_at: new Date(Date.now() - 2 * DAY), end_at: new Date(Date.now() - 1000) }, { where: { user_id: player.uuid } });
    assert.equal(await playerLogin(player), 200);
});

test('AD-073: 영구 정지 → is_permanent, end_at 없음, 계속 못 들어옴', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const player = await makePlayer();
    const res = await agent.post(`/admin-api/members/${player.uuid}/bans`, { kind: 'PERMANENT', reason: '핵 사용' });
    assert.equal(res.status, 201);
    assert.equal(res.body.ban.isPermanent, true);
    assert.equal(res.body.ban.endAt, null);
    const row = await db().UserBan.findOne({ where: { user_id: player.uuid }, raw: true });
    assert.equal(Boolean(row.is_permanent), true);
    assert.equal(row.end_at, null);
    // 한참 뒤(시작 시각을 1년 전으로)도 막힘
    await db().UserBan.update({ start_at: new Date(Date.now() - 365 * DAY) }, { where: { user_id: player.uuid } });
    assert.equal(await playerLogin(player), 403);
});

test('AD-074: 이미 정지 중 → 409 ALREADY_BANNED { banId }, 두 줄 안 생김', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const player = await makePlayer();
    const first = await agent.post(`/admin-api/members/${player.uuid}/bans`, { kind: 'PERIOD', days: 3, reason: '욕설' });
    const again = await agent.post(`/admin-api/members/${player.uuid}/bans`, { kind: 'PERMANENT', reason: '또 욕설' });
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'ALREADY_BANNED');
    assert.equal(again.body.banId, first.body.ban.id);
    assert.equal(await db().UserBan.count({ where: { user_id: player.uuid } }), 1);
});

test('AD-075: 기간 바꾸기 → end_at·is_permanent 바뀜, 정지 사유는 그대로, 기록 BAN_UPDATE 전후 값', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const player = await makePlayer();
    const made = await agent.post(`/admin-api/members/${player.uuid}/bans`, { kind: 'PERIOD', days: 3, reason: '욕설' });
    const banId = made.body.ban.id;

    const longer = await agent.request('PATCH', `/admin-api/members/${player.uuid}/bans/${banId}`, { body: { kind: 'PERIOD', days: 30, reason: '반복이라 늘림' } });
    assert.equal(longer.status, 200);
    const afterLonger = await db().UserBan.findByPk(banId, { raw: true });
    assert.ok(Math.abs(new Date(afterLonger.end_at) - Date.now() - 30 * DAY) < 5000);
    assert.equal(afterLonger.reason, '욕설');

    const forever = await agent.request('PATCH', `/admin-api/members/${player.uuid}/bans/${banId}`, { body: { kind: 'PERMANENT', reason: '영구로' } });
    assert.equal(forever.body.ban.isPermanent, true);
    const afterForever = await db().UserBan.findByPk(banId, { raw: true });
    assert.equal(Boolean(afterForever.is_permanent), true);
    assert.equal(afterForever.end_at, null);

    const logs = await logsOf('BAN_UPDATE', player.uuid);
    assert.equal(logs.length, 2);
    assert.equal(logs[0].reason, '반복이라 늘림');
    assert.equal(parse(logs[0].before_value).isPermanent, false);
    assert.equal(parse(logs[1].after_value).ban.isPermanent, true);

    const missing = await agent.request('PATCH', `/admin-api/members/${player.uuid}/bans/999999`, { body: { kind: 'PERMANENT', reason: 'x' } });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'BAN_NOT_FOUND');
});

test('AD-076: 해제 → end_at 지금·lifted_at·lifted_by·lift_reason, 바로 로그인 됨, 기록 UNBAN 사유', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const player = await makePlayer();
    const made = await agent.post(`/admin-api/members/${player.uuid}/bans`, { kind: 'PERMANENT', reason: '욕설' });
    assert.equal(await playerLogin(player), 403);
    const before = Date.now();
    const res = await agent.post(`/admin-api/members/${player.uuid}/unban`, { reason: '이의 신청 받아들임' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, liftedCount: 1 });
    const row = await db().UserBan.findByPk(made.body.ban.id, { raw: true });
    assert.equal(Boolean(row.is_permanent), false);
    assert.ok(new Date(row.end_at).getTime() >= before - 2000 && new Date(row.end_at).getTime() <= Date.now() + 1000);
    assert.ok(row.lifted_at);
    assert.equal(row.lifted_by, admin.id);
    assert.equal(row.lift_reason, '이의 신청 받아들임');
    assert.equal(row.reason, '욕설', '정지 줄은 안 지우고 사유도 남김');
    assert.equal(await playerLogin(player), 200);
    const [log] = await logsOf('UNBAN', player.uuid);
    assert.equal(log.reason, '이의 신청 받아들임');
    assert.equal(parse(log.after_value).liftedCount, 1);
    assert.equal(parse(log.before_value)[0].id, made.body.ban.id);
});

test('AD-077: 사유 빔 → 400 REASON_REQUIRED (정지·기간 바꾸기·해제·강제 종료), 아무것도 안 바뀜', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const player = await makePlayer();
    const base = `/admin-api/members/${player.uuid}`;
    const cases = [
        await agent.post(`${base}/bans`, { kind: 'PERIOD', days: 3, reason: '   ' }),
        await agent.post(`${base}/bans`, { kind: 'PERMANENT' }),
        await agent.post(`${base}/unban`, { reason: '' }),
        await agent.post(`${base}/force-disconnect`, {}),
        await agent.request('PATCH', `${base}/bans/1`, { body: { kind: 'PERMANENT', reason: '' } }),
    ];
    for (const res of cases) {
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'REASON_REQUIRED');
    }
    assert.equal(await db().UserBan.count({ where: { user_id: player.uuid } }), 0);
    // 모르는 칸·틀린 기간은 INVALID_INPUT
    const unknown = await agent.post(`${base}/bans`, { kind: 'PERIOD', days: 3, reason: 'x', note: 'y' });
    assert.deepEqual([unknown.status, unknown.body.code, unknown.body.field], [400, 'INVALID_INPUT', 'note']);
    const badDays = await agent.post(`${base}/bans`, { kind: 'PERIOD', days: 0, reason: 'x' });
    assert.deepEqual([badDays.status, badDays.body.field], [400, 'days']);
});

test('AD-078: 정지 아닌 사람 해제 → 409 NOT_BANNED, 탈퇴 회원 정지 → 409 MEMBER_WITHDRAWN, 없는 회원 404', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const player = await makePlayer();
    const notBanned = await agent.post(`/admin-api/members/${player.uuid}/unban`, { reason: '풀기' });
    assert.deepEqual([notBanned.status, notBanned.body.code], [409, 'NOT_BANNED']);

    const gone = await makePlayer();
    await db().User.update({ status: 'WITHDRAWN' }, { where: { uuid: gone.uuid } });
    await db().User.destroy({ where: { uuid: gone.uuid } });
    const withdrawn = await agent.post(`/admin-api/members/${gone.uuid}/bans`, { kind: 'PERMANENT', reason: '정지' });
    assert.deepEqual([withdrawn.status, withdrawn.body.code], [409, 'MEMBER_WITHDRAWN']);

    const missing = await agent.post(`/admin-api/members/${crypto.randomUUID()}/bans`, { kind: 'PERMANENT', reason: '정지' });
    assert.deepEqual([missing.status, missing.body.code], [404, 'MEMBER_NOT_FOUND']);
    const missingKick = await agent.post(`/admin-api/members/${crypto.randomUUID()}/force-disconnect`, { reason: '끊기' });
    assert.deepEqual([missingKick.status, missingKick.body.code], [404, 'MEMBER_NOT_FOUND']);
});

test('AD-079: Node 둘 — 다른 Node 접속자도 정지 즉시 끊김 (메모리 받침 클러스터)', async (t) => {
    if (skipWithoutDb(t)) return;
    const { startPair, fakeSocket } = require('../cluster/helpers/slice2');
    await startPair(t);
    const { agent } = await adminTestApp({ t });
    const player = await makePlayer();
    const mine = fakeSocket(player.uuid);
    const remote = fakeSocket(player.uuid);
    // 어댑터 붙은 io 흉내: in = 전 Node, local.in = 이 Node만
    emitter().setIo({
        in: () => ({ fetchSockets: async () => [mine, remote] }),
        local: { in: () => ({ fetchSockets: async () => [mine] }) },
    });
    t.after(() => emitter().setIo(null));
    const res = await agent.post(`/admin-api/members/${player.uuid}/bans`, { kind: 'PERIOD', days: 1, reason: '욕설' });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.disconnect, { disconnected: 2, partial: false });
    assert.equal(remote.disconnected, true);
    assert.equal(remote.emitted[0].payload.code, 'ACCOUNT_BANNED');
});

test('banMember(2-1 신고가 씀): 바깥 트랜잭션 안에서 정지 + 기록, 이미 정지면 ALREADY_BANNED, 되돌리면 둘 다 없음', async (t) => {
    if (skipWithoutDb(t)) return;
    const { admin } = await adminTestApp({ t });
    const { banMember } = require('../../admin/services/sanctions/ban');
    const player = await makePlayer();
    const req = { admin: { id: admin.id }, adminRequestMeta: { ip: '10.9.9.9', accessEmail: null } };
    await assert.rejects(db().sequelize.transaction(async (transaction) => {
        await banMember({ req, uuid: player.uuid, kind: 'PERIOD', days: 2, reason: '신고 처리' }, { transaction });
        throw new Error('신고 갱신 실패 흉내');
    }), /신고 갱신 실패 흉내/);
    assert.equal(await db().UserBan.count({ where: { user_id: player.uuid } }), 0);
    assert.equal((await logsOf('BAN', player.uuid)).length, 0, '기록도 같이 되돌아감');

    const { ban } = await db().sequelize.transaction((transaction) => banMember({ req, uuid: player.uuid, kind: 'PERMANENT', reason: '신고 처리' }, { transaction }));
    assert.equal(ban.isPermanent, true);
    await assert.rejects(
        db().sequelize.transaction((transaction) => banMember({ req, uuid: player.uuid, kind: 'PERMANENT', reason: '또' }, { transaction })),
        (error) => error.code === 'ALREADY_BANNED' && error.details.banId === ban.id,
    );
});
