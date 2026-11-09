'use strict';

// 회원 찾기·상태 통합 시험 (AD-060~065), 진짜 시험 DB + 관리자 라우터(로그인된 시험 앱)
// npm run test:with-db -- tests/admin/members.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-members-integration-secret';

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
const tagOf = () => crypto.randomBytes(3).toString('hex');

// 시험 회원 하나 (닉네임 앞머리를 정해 찾기 시험에 씀)
const makeMember = async ({ prefix = '회원', email } = {}) => {
    const tag = tagOf();
    return db().User.create({
        uuid: crypto.randomUUID(), password_hash: 'x', nickname: `${prefix}${tag}`, email: email ?? `mem-${tag}@example.com`,
    });
};

test('AD-060: UUID 같음·닉네임 앞부분·이메일 같음으로 찾음, 목록 이메일은 가림', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const prefix = `가면${tagOf()}`;
    const one = await makeMember({ prefix, email: `alice-${tagOf()}@gmail.com` });
    const two = await makeMember({ prefix });
    await makeMember({ prefix: '다른' });

    const byUuid = await agent.get(`/admin-api/members?q=${one.uuid}`);
    assert.equal(byUuid.status, 200);
    assert.deepEqual(byUuid.body.items.map((item) => item.uuid), [one.uuid]);
    assert.equal(byUuid.body.nextBefore, null);

    const byNickname = await agent.get(`/admin-api/members?q=${encodeURIComponent(prefix)}`);
    assert.deepEqual(byNickname.body.items.map((item) => item.uuid).sort(), [one.uuid, two.uuid].sort());

    const byEmail = await agent.get(`/admin-api/members?q=${encodeURIComponent(one.email)}`);
    assert.deepEqual(byEmail.body.items.map((item) => item.uuid), [one.uuid]);
    const item = byEmail.body.items[0];
    assert.notEqual(item.emailMasked, one.email);
    assert.match(item.emailMasked, /\*\*\*/);
    assert.equal(JSON.stringify(byEmail.body).includes(one.email), false, '응답 어디에도 이메일 원문 없음');
    assert.deepEqual(Object.keys(item).sort(), ['banned', 'createdAt', 'emailMasked', 'nickname', 'online', 'status', 'uuid', 'withdrawn'].sort());

    // 이메일 부분 찾기는 안 됨, 닉네임 한 글자는 400
    const partialEmail = await agent.get(`/admin-api/members?q=${encodeURIComponent('alice@')}`);
    assert.deepEqual(partialEmail.body.items, []);
    const short = await agent.get(`/admin-api/members?q=${encodeURIComponent('가')}`);
    assert.equal(short.status, 400);
    assert.equal(short.body.code, 'INVALID_INPUT');
    assert.equal(short.body.field, 'q');
});

test('AD-060: 닉네임 찾기는 50줄씩 커서로 이어 봄 (limit·nextBefore)', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const prefix = `줄${tagOf()}`;
    for (let i = 0; i < 3; i += 1) await makeMember({ prefix });
    const first = await agent.get(`/admin-api/members?q=${encodeURIComponent(prefix)}&limit=2`);
    assert.equal(first.body.items.length, 2);
    assert.ok(first.body.nextBefore);
    const second = await agent.get(`/admin-api/members?q=${encodeURIComponent(prefix)}&limit=2&before=${encodeURIComponent(first.body.nextBefore)}`);
    assert.equal(second.body.items.length, 1);
    assert.equal(second.body.nextBefore, null);
    const all = [...first.body.items, ...second.body.items].map((item) => item.uuid);
    assert.equal(new Set(all).size, 3, '겹침 없음');
});

test('AD-061: 없는 회원 → 빈 목록, 상세 404 MEMBER_NOT_FOUND', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const empty = await agent.get(`/admin-api/members?q=${encodeURIComponent(`없는${tagOf()}`)}`);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.items, []);
    const missing = await agent.get(`/admin-api/members/${crypto.randomUUID()}`);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'MEMBER_NOT_FOUND');
    const notUuid = await agent.get('/admin-api/members/abc');
    assert.equal(notUuid.status, 404);
});

test('AD-062: 탈퇴 회원은 UUID로 찾으면 withdrawn:true (상세도)', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const member = await makeMember();
    await db().User.update({ status: 'WITHDRAWN' }, { where: { uuid: member.uuid } });
    await db().User.destroy({ where: { uuid: member.uuid } });
    const found = await agent.get(`/admin-api/members?q=${member.uuid}`);
    assert.equal(found.body.items.length, 1);
    assert.equal(found.body.items[0].withdrawn, true);
    assert.equal(found.body.items[0].online, false);
    const detail = await agent.get(`/admin-api/members/${member.uuid}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.member.withdrawn, true);
});

test('AD-063: 상세 — 가입일·상태·접속 중·정지 기록(해제 사유)·받은 신고·최근 로그인(IP 가림)', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const member = await makeMember();
    const reporter = await makeMember();
    const now = Date.now();
    await db().UserBan.create({
        user_id: member.uuid, reason: '욕설', banned_by: admin.id, start_at: new Date(now - 3 * 86400000), end_at: new Date(now - 86400000),
        lifted_at: new Date(now - 2 * 86400000), lifted_by: admin.id, lift_reason: '오해였음',
    });
    await db().UserBan.create({ user_id: member.uuid, reason: '도배', banned_by: admin.id, start_at: new Date(now - 1000), is_permanent: true });
    await db().Report.create({ reporter_id: reporter.uuid, target_id: member.uuid, game_id: 'g-1', reason_code: 'ABUSE' });
    await db().LoginHistory.create({ user_id: member.uuid, ip_address: '123.45.67.89', success: true });
    const emitter = require('../../socket/emitter');
    emitter.onlineUsers.set(member.uuid, { socketId: 's-1' });
    t.after(() => emitter.onlineUsers.delete(member.uuid));

    const res = await agent.get(`/admin-api/members/${member.uuid}`);
    assert.equal(res.status, 200);
    const { member: shown, bans, reportsReceived, logins } = res.body;
    assert.equal(shown.uuid, member.uuid);
    assert.equal(shown.status, 'ACTIVE');
    assert.equal(shown.online, true);
    assert.ok(shown.onlineNode);
    assert.equal(shown.withdrawn, false);
    assert.ok(!Number.isNaN(Date.parse(shown.createdAt)));
    assert.notEqual(shown.emailMasked, member.email);
    assert.equal(bans.length, 2);
    assert.equal(bans[0].reason, '도배');
    assert.equal(bans[0].isPermanent, true);
    assert.equal(bans[0].active, true);
    assert.equal(bans[0].bannedBy, admin.id);
    assert.equal(bans[0].bannedByLoginId, admin.loginId);
    assert.equal(bans[1].active, false);
    assert.equal(bans[1].liftReason, '오해였음');
    assert.equal(bans[1].liftedBy, admin.id);
    assert.ok(bans[1].liftedAt);
    assert.deepEqual(reportsReceived.map((row) => [row.reasonCode, row.status]), [['ABUSE', 'OPEN']]);
    assert.equal(logins.length, 1);
    assert.equal(logins[0].ipMasked, '123.45.*.*');
    assert.equal(logins[0].success, true);
    assert.equal(JSON.stringify(res.body).includes('password'), false, '비번 칸 없음');
    assert.equal(JSON.stringify(res.body).includes('67.89'), false, 'IP 원문 없음');
});

test('AD-064: 접속 중 판단 — ONLINE 줄이라도 죽은 Node 줄이면 접속 아님 (Node 둘, 메모리 받침)', async (t) => {
    if (skipWithoutDb(t)) return;
    const { startPair } = require('../cluster/helpers/slice2');
    await startPair(t);
    const { getMemberDetail } = require('../../admin/services/members/detail');
    const deps = {
        db: db(), cluster: require('../../cluster'), onlineUsers: new Map(), queue: require('../../admin/services/core/queryQueue'),
    };
    const alive = await makeMember();
    const dead = await makeMember();
    const mineStale = await makeMember();
    const offline = await makeMember();
    await db().OnlinePresence.create({ user_id: alive.uuid, status: 'ONLINE', server_id: 'n2' });
    await db().OnlinePresence.create({ user_id: dead.uuid, status: 'ONLINE', server_id: 'n9' });
    await db().OnlinePresence.create({ user_id: mineStale.uuid, status: 'ONLINE', server_id: 'n1' });
    await db().OnlinePresence.create({ user_id: offline.uuid, status: 'OFFLINE', server_id: 'n2' });

    const shown = async (member) => (await getMemberDetail(member.uuid, deps)).member;
    assert.deepEqual([(await shown(alive)).online, (await shown(alive)).onlineNode], [true, 'n2']);
    assert.equal((await shown(dead)).online, false, '죽은 Node 줄');
    assert.equal((await shown(mineStale)).online, false, '내 Node 줄인데 접속 목록에 없음');
    assert.equal((await shown(offline)).online, false);
    deps.onlineUsers.set(mineStale.uuid, {});
    assert.deepEqual([(await shown(mineStale)).online, (await shown(mineStale)).onlineNode], [true, 'n1']);
});

test('AD-065: 이메일 보기 → 전체 이메일 + VIEW_PII 기록', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const member = await makeMember();
    const res = await agent.post(`/admin-api/members/${member.uuid}/reveal-email`);
    assert.equal(res.status, 200);
    assert.equal(res.body.email, member.email);
    const logs = await db().AdminAuditLog.findAll({ where: { admin_id: admin.id, action: 'VIEW_PII' }, raw: true });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].target_id, member.uuid);
    const missing = await agent.post(`/admin-api/members/${crypto.randomUUID()}/reveal-email`);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'MEMBER_NOT_FOUND');
});
