'use strict';

// 관리자 공지·발송 결과 통합 시험 (AD-090~093), 진짜 시험 DB + 관리자 라우터
// npm run test:with-db -- tests/admin/announcements.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

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
const parse = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

let serial = 0;
const makeUser = async () => {
    serial += 1;
    const tag = `${Date.now() % 1000000}${serial}`;
    return db().User.create({ uuid: crypto.randomUUID(), password_hash: 'x', nickname: `an${tag}`, email: `an${tag}@example.com` });
};

const noticesOf = (uuid, requestId) => db().Notification.findAll({
    where: { user_id: uuid, source_key: `announcement:${requestId}` }, raw: true,
});

test('AD-090: 고른 회원 공지 → 알림 저장, 결과 수 응답, 기록 ANNOUNCE에 제목·대상·결과 수', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const a = await makeUser();
    const b = await makeUser();
    const requestId = crypto.randomUUID();

    const res = await agent.post('/admin-api/announcements', {
        requestId, title: '점검 안내', body: '오늘 밤 12시 점검', target: 'users', userUuids: [a.uuid, b.uuid],
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(res.body.result, { recipientCount: 2, created: 2, duplicated: 0, failed: 0 });
    assert.ok(res.body.auditId);

    assert.equal((await noticesOf(a.uuid, requestId)).length, 1);
    const [notice] = await noticesOf(b.uuid, requestId);
    assert.equal(notice.title, '점검 안내');
    assert.equal(notice.body, '오늘 밤 12시 점검');

    const row = await db().AdminAuditLog.findByPk(res.body.auditId, { raw: true });
    assert.equal(row.action, 'ANNOUNCE');
    assert.equal(row.admin_id, admin.id);
    assert.equal(row.request_id, requestId);
    assert.equal(row.target_type, 'announcement');
    assert.equal(row.target_id, requestId);
    assert.deepEqual(parse(row.after_value), {
        title: '점검 안내', body: '오늘 밤 12시 점검', target: 'users', selectedCount: 2,
        recipientCount: 2, created: 2, duplicated: 0, failed: 0,
    });
});

test('AD-091: 같은 requestId 두 번 → 알림 한 번, 두 번째는 duplicated', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const a = await makeUser();
    const payload = { requestId: crypto.randomUUID(), title: '한 번만', body: '두 번 눌러도', target: 'users', userUuids: [a.uuid] };

    const first = await agent.post('/admin-api/announcements', payload);
    const second = await agent.post('/admin-api/announcements', payload);
    assert.deepEqual(first.body.result, { recipientCount: 1, created: 1, duplicated: 0, failed: 0 });
    assert.deepEqual(second.body.result, { recipientCount: 1, created: 0, duplicated: 1, failed: 0 });
    assert.equal((await noticesOf(a.uuid, payload.requestId)).length, 1);
});

test('AD-092: 없는 UUID 섞음 → failed 수, 나머지는 감', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const a = await makeUser();
    const ghost = crypto.randomUUID();
    const requestId = crypto.randomUUID();

    const res = await agent.post('/admin-api/announcements', {
        requestId, title: '섞임', body: '없는 사람 섞음', target: 'users', userUuids: [a.uuid, ghost],
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.result, { recipientCount: 2, created: 1, duplicated: 0, failed: 1 });
    assert.equal((await noticesOf(a.uuid, requestId)).length, 1);
    assert.equal((await noticesOf(ghost, requestId)).length, 0);
});

test('AD-093: online → 접속자 소켓이 알림 받음 (접속 안 한 사람은 안 받음)', async (t) => {
    if (skipWithoutDb(t)) return;
    const emitter = require('../../socket/emitter');
    const { agent } = await adminTestApp({ t });
    const on1 = await makeUser();
    const on2 = await makeUser();
    const off = await makeUser();

    // 가짜 io: 채널로 보낸 것만 모음, 시험 끝나면 되돌림
    const sent = [];
    const savedIo = emitter.getIo();
    const savedOnline = new Map(emitter.onlineUsers);
    emitter.onlineUsers.clear();
    emitter.onlineUsers.set(on1.uuid, 'socket-1');
    emitter.onlineUsers.set(on2.uuid, 'socket-2');
    emitter.setIo({ to: (channel) => ({ emit: (event, payload) => sent.push({ channel, event, payload }) }) });
    t.after(() => {
        emitter.setIo(savedIo);
        emitter.onlineUsers.clear();
        for (const [key, value] of savedOnline) emitter.onlineUsers.set(key, value);
    });

    const requestId = crypto.randomUUID();
    const res = await agent.post('/admin-api/announcements', { requestId, title: '접속자 전체', body: '지금 접속한 분들께', target: 'online' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.result, { recipientCount: 2, created: 2, duplicated: 0, failed: 0 });

    const got = sent.filter((item) => item.event === 'notification_created');
    const channels = got.map((item) => item.channel).sort();
    assert.deepEqual(channels, [`user:${on1.uuid}`, `user:${on2.uuid}`].sort());
    assert.equal(got[0].payload.notification.title, '접속자 전체');
    assert.equal((await noticesOf(off.uuid, requestId)).length, 0);

    const row = await db().AdminAuditLog.findByPk(res.body.auditId, { raw: true });
    assert.equal(parse(row.after_value).target, 'online');
    assert.equal(parse(row.after_value).selectedCount, null);
});

test('AD-090: 모양 틀림 → 400 INVALID_INPUT { field }, 모르는 칸 거절', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const base = { requestId: crypto.randomUUID(), title: '제목', body: '본문', target: 'online' };
    const cases = [
        [{ ...base, requestId: 'not-uuid' }, 'requestId'],
        [{ ...base, title: '' }, 'title'],
        [{ ...base, title: 'a'.repeat(121) }, 'title'],
        [{ ...base, body: 'b'.repeat(501) }, 'body'],
        [{ ...base, target: 'all' }, 'target'],
        [{ ...base, target: 'users', userUuids: [] }, 'userUuids'],
        [{ ...base, target: 'users', userUuids: ['x'] }, 'userUuids'],
        [{ ...base, extra: 1 }, 'extra'],
    ];
    for (const [body, field] of cases) {
        const res = await agent.post('/admin-api/announcements', body);
        assert.equal(res.status, 400, field);
        assert.equal(res.body.code, 'INVALID_INPUT');
        assert.equal(res.body.field, field);
    }
});
