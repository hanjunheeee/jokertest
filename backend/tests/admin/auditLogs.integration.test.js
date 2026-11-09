'use strict';

// 관리자 처리 이력 통합 시험 (AD-100~104), 진짜 시험 DB + 관리자 라우터
// npm run test:with-db -- tests/admin/auditLogs.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb, adminTestApp, createTestAdmin } = require('./helpers/adminTestApp');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => { if (dbHandle) await dbHandle.close(); });

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');
const audit = require('../../admin/services/core/audit');

let serial = 0;
const makeUser = async () => {
    serial += 1;
    const tag = `${Date.now() % 1000000}${serial}`;
    return db().User.create({ uuid: crypto.randomUUID(), password_hash: 'x', nickname: `al${tag}`, email: `al${tag}@example.com` });
};

const fakeReq = (adminId) => ({ admin: { id: adminId }, adminRequestMeta: { ip: '203.0.113.9', accessEmail: 'cto@example.com' } });

// 제재 기록 넣기 (1-2가 남기는 모양 그대로: target_type 'member', target_id 회원 uuid)
const sanction = (adminId, action, uuid, { after = {}, reason = '사유', targetType = 'member' } = {}) => audit.record({
    req: fakeReq(adminId), action, targetType, targetId: uuid, after, reason,
});

const query = (params) => `/admin-api/audit-logs?${new URLSearchParams(params)}`;

test('AD-100: kind=announce → 공지만, 제목·대상·결과 수', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const user = await makeUser();
    await agent.post('/admin-api/announcements', {
        requestId: crypto.randomUUID(), title: '이력 공지', body: '본문', target: 'users', userUuids: [user.uuid],
    });
    await sanction(admin.id, 'BAN', user.uuid, { after: { kind: 'PERIOD', days: 7 } });

    const res = await agent.get(query({ kind: 'announce', adminId: admin.id }));
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 1);
    const [item] = res.body.items;
    assert.equal(item.action, 'ANNOUNCE');
    assert.deepEqual(item.admin, { id: admin.id, loginId: admin.loginId });
    assert.equal(item.after.title, '이력 공지');
    assert.equal(item.after.target, 'users');
    assert.equal(item.after.selectedCount, 1);
    assert.equal(item.after.recipientCount, 1);
    assert.equal(item.after.created, 1);
    assert.equal(item.after.failed, 0);
    assert.match(item.createdAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
    // 시각은 UTC 그대로 (이 컴퓨터 시각대로 9시간 밀리지 않게)
    assert.ok(Math.abs(Date.parse(item.createdAt) - Date.now()) < 5 * 60_000, item.createdAt);
    assert.equal(res.body.nextBefore, null);
});

test('AD-101: kind=sanction → 강제 종료·정지·기간 바꾸기·해제·신고 처리, 종류·사유·대상 닉네임', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const user = await makeUser();
    await sanction(admin.id, 'FORCE_DISCONNECT', user.uuid, { reason: '도배' });
    await sanction(admin.id, 'BAN', user.uuid, { after: { kind: 'PERMANENT' }, reason: '욕설' });
    await sanction(admin.id, 'BAN_UPDATE', user.uuid, { after: { kind: 'PERIOD', days: 3 }, reason: '감경' });
    await sanction(admin.id, 'UNBAN', user.uuid, { reason: '오해 풀림' });
    await sanction(admin.id, 'REPORT_RESOLVE', user.uuid, { reason: '신고 처리' });
    await sanction(admin.id, 'REPORT_DISMISS', user.uuid, { reason: '기각' });
    await sanction(admin.id, 'VIEW_PII', user.uuid);

    const res = await agent.get(query({ kind: 'sanction', adminId: admin.id }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.items.map((item) => item.action), ['REPORT_RESOLVE', 'UNBAN', 'BAN_UPDATE', 'BAN', 'FORCE_DISCONNECT']);
    const ban = res.body.items.find((item) => item.action === 'BAN');
    assert.equal(ban.reason, '욕설');
    assert.deepEqual(ban.after, { kind: 'PERMANENT' });
    assert.equal(ban.targetType, 'member');
    assert.equal(ban.targetId, user.uuid);
    assert.deepEqual(ban.target, { uuid: user.uuid, nickname: user.nickname });
    assert.equal(ban.ip, '203.0.113.9');
    assert.equal(ban.accessEmail, 'cto@example.com');

    const all = await agent.get(query({ adminId: admin.id }));
    assert.ok(all.body.items.some((item) => item.action === 'VIEW_PII'));
    assert.ok(all.body.items.some((item) => item.action === 'ADMIN_LOGIN'));
});

test('AD-102: memberUuid → 그 회원 대상 줄만', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const one = await makeUser();
    const other = await makeUser();
    await sanction(admin.id, 'BAN', one.uuid);
    await sanction(admin.id, 'BAN', other.uuid);
    await sanction(admin.id, 'UNBAN', one.uuid);
    // 주고 뺏기(2-8)는 'user', 신고 처리(2-1)는 신고 번호 + after.targetUuid
    await sanction(admin.id, 'WALLET_ADJUST', one.uuid, { targetType: 'user' });
    await sanction(admin.id, 'REPORT_RESOLVE', '77', { targetType: 'report', after: { status: 'RESOLVED', targetUuid: one.uuid } });
    await sanction(admin.id, 'REPORT_RESOLVE', '78', { targetType: 'report', after: { status: 'RESOLVED', targetUuid: other.uuid } });

    const res = await agent.get(query({ memberUuid: one.uuid }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.items.map((item) => item.action), ['REPORT_RESOLVE', 'WALLET_ADJUST', 'UNBAN', 'BAN']);
    assert.ok(res.body.items.every((item) => item.target.uuid === one.uuid && item.target.nickname === one.nickname));
    assert.equal(res.body.items[0].targetId, '77');
});

test('AD-103: 누가·기간 거르기, 50줄 쪽 나누기', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const other = await createTestAdmin();
    const user = await makeUser();
    for (let i = 0; i < 52; i += 1) await sanction(admin.id, 'FORCE_DISCONNECT', user.uuid, { reason: `r${i}` });
    await sanction(other.id, 'BAN', user.uuid);

    // 쪽 나누기: 50 + 나머지 (로그인 기록 포함), 겹침 없음
    const first = await agent.get(query({ adminId: admin.id }));
    assert.equal(first.body.items.length, 50);
    assert.ok(first.body.nextBefore);
    const second = await agent.get(query({ adminId: admin.id, before: first.body.nextBefore }));
    assert.equal(second.body.items.length, 3);
    assert.equal(second.body.nextBefore, null);
    const ids = [...first.body.items, ...second.body.items].map((item) => item.id);
    assert.equal(new Set(ids).size, 53);
    assert.ok(ids.every((id, i) => i === 0 || id < ids[i - 1]));

    // 누가: 다른 관리자 줄만
    const byOther = await agent.get(query({ adminId: other.id }));
    assert.deepEqual(byOther.body.items.map((item) => item.action), ['BAN']);
    assert.equal(byOther.body.items[0].admin.loginId, other.loginId);

    // 작은 limit
    const small = await agent.get(query({ adminId: admin.id, limit: 2 }));
    assert.equal(small.body.items.length, 2);

    // 기간: 오래된 줄 하나를 어제로 옮겨서 거름
    const oldId = second.body.items[second.body.items.length - 1].id;
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    await db().AdminAuditLog.update({ created_at: yesterday }, { where: { id: oldId } });
    const today = new Date(Date.now() - 3600 * 1000).toISOString();
    const recent = await agent.get(query({ adminId: admin.id, from: today, limit: 50, before: first.body.nextBefore }));
    assert.ok(!recent.body.items.some((item) => item.id === oldId));
    const past = await agent.get(query({ adminId: admin.id, to: today }));
    assert.deepEqual(past.body.items.map((item) => item.id), [oldId]);

    // 관리자 목록 (누가 거르기용)
    const admins = await agent.get('/admin-api/admins');
    assert.equal(admins.status, 200);
    const loginIds = admins.body.items.map((item) => item.loginId);
    assert.ok(loginIds.includes(admin.loginId) && loginIds.includes(other.loginId));
    assert.deepEqual(Object.keys(admins.body.items[0]).sort(), ['id', 'loginId']);

    // 거르기 모양 틀림
    for (const [params, field] of [
        [{ kind: 'money' }, 'kind'], [{ memberUuid: 'x' }, 'memberUuid'], [{ limit: 51 }, 'limit'],
        [{ from: 'yesterday' }, 'from'], [{ before: '-1' }, 'before'], [{ page: 2 }, 'page'],
    ]) {
        const bad = await agent.get(query(params));
        assert.equal(bad.status, 400, field);
        assert.equal(bad.body.field, field);
    }
});

test('AD-104: 기록 고치기·지우기 경로 없음 (PUT·PATCH·DELETE 404)', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const user = await makeUser();
    const { id } = await sanction(admin.id, 'BAN', user.uuid);
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
        for (const path of ['/admin-api/audit-logs', `/admin-api/audit-logs/${id}`, '/admin-api/admins']) {
            const res = await agent.request(method, path, { body: { reason: 'x' } });
            assert.equal(res.status, 404, `${method} ${path}`);
        }
    }
    assert.ok(await db().AdminAuditLog.findByPk(id));
});
