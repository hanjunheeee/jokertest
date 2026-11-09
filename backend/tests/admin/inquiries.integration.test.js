'use strict';

// 관리자 문의 처리·답 알림 통합 시험 (AD-280~283), 진짜 시험 DB + 관리자 라우터
// npm run test:with-db -- tests/admin/inquiries.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
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
const notificationService = () => require('../../services/notification');
const parse = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

let serial = 0;
const makeUser = async () => {
    serial += 1;
    const tag = `${Date.now() % 1000000}${serial}`;
    return db().User.create({ uuid: crypto.randomUUID(), password_hash: 'x', nickname: `iq${tag}`, email: `iq${tag}@example.com` });
};

// 문의 바로 넣기 (플레이어 쓰기 경로는 2-14 시험이 봄)
const makeInquiry = async (user, { title = '방이 안 열려요', status = 'OPEN', at = new Date() } = {}) => db().Inquiry.create({
    user_id: user.uuid, category: 'BUG', title, body: '방 만들기 누르면 멈춤', status, created_at: at, updated_at: at,
});

// 알림 보내기 가로채기 (접속 중인 사람에게 가는 사건)
const catchEmits = (t) => {
    const sent = [];
    notificationService().__internal.__setDepsForTests({ emitToUser: (userId, event, payload) => sent.push({ userId, event, payload }) });
    t.after(() => notificationService().__internal.__setDepsForTests(null));
    return sent;
};

test('AD-280: 답 → 답 줄·ANSWERED·answered_at·알림(inquiry-reply:<id>, target inquiry)·기록 INQUIRY_REPLY', async (t) => {
    if (skipWithoutDb(t)) return;
    catchEmits(t);
    const { agent, admin } = await adminTestApp({ t });
    const user = await makeUser();
    const inquiry = await makeInquiry(user);
    const requestId = crypto.randomUUID();

    const res = await agent.post(`/admin-api/inquiries/${inquiry.id}/replies`, { requestId, body: '  고쳤어요. 다시 해 보세요.  ' });
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.notified, true);
    assert.equal(res.body.inquiry.status, 'ANSWERED');
    assert.equal(res.body.reply.body, '고쳤어요. 다시 해 보세요.');
    assert.equal(res.body.reply.admin.loginId, admin.loginId);

    const replies = await db().InquiryReply.findAll({ where: { inquiry_id: inquiry.id }, raw: true });
    assert.equal(replies.length, 1);
    assert.equal(replies[0].admin_id, admin.id);
    assert.equal(replies[0].request_id, requestId);
    const row = await db().Inquiry.findByPk(inquiry.id, { raw: true });
    assert.equal(row.status, 'ANSWERED');
    assert.ok(row.answered_at);

    const notices = await db().Notification.findAll({ where: { user_id: user.uuid }, raw: true });
    assert.equal(notices.length, 1);
    assert.equal(notices[0].type, 'system');
    assert.equal(notices[0].source_key, `inquiry-reply:${replies[0].id}`);
    assert.equal(notices[0].title, '문의에 답이 왔어요');
    assert.equal(notices[0].body, '방이 안 열려요');
    assert.deepEqual(parse(notices[0].target), { kind: 'inquiry', inquiryId: Number(inquiry.id) });

    const audit = await db().AdminAuditLog.findOne({ where: { action: 'INQUIRY_REPLY', request_id: requestId }, raw: true });
    assert.ok(audit);
    assert.equal(audit.admin_id, admin.id);
    assert.equal(audit.target_type, 'inquiry');
    assert.equal(audit.target_id, String(inquiry.id));
    assert.deepEqual(parse(audit.before_value), { status: 'OPEN' });
    assert.equal(parse(audit.after_value).status, 'ANSWERED');

    // 플레이어 상세에도 "운영팀" 답 (2-14 경로 서비스)
    const mine = await require('../../services/inquiry/read').getMyInquiry({ userId: user.uuid, inquiryId: String(inquiry.id) });
    assert.equal(mine.status, 'ANSWERED');
    assert.deepEqual(mine.replies.map((reply) => [reply.body, reply.from]), [['고쳤어요. 다시 해 보세요.', '운영팀']]);
});

test('AD-281: 접속 중이면 소켓 알림, 아니면 다음 알림 목록에 있음', async (t) => {
    if (skipWithoutDb(t)) return;
    const sent = catchEmits(t);
    const { agent } = await adminTestApp({ t });
    const user = await makeUser();
    const inquiry = await makeInquiry(user, { title: '골드가 안 들어와요' });

    const res = await agent.post(`/admin-api/inquiries/${inquiry.id}/replies`, { requestId: crypto.randomUUID(), body: '넣어 드렸어요.' });
    assert.equal(res.status, 201);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].userId, user.uuid);
    assert.equal(sent[0].event, 'notification_created');
    assert.deepEqual(sent[0].payload.notification.target, { kind: 'inquiry', inquiryId: Number(inquiry.id) });

    // 꺼져 있던 사람: 다음 접속 때 읽는 알림 목록에 있음
    const list = await notificationService().listForUser(user.uuid);
    assert.equal(list.filter((notice) => notice.sourceKey === `inquiry-reply:${res.body.reply.id}`).length, 1);
    assert.equal(list[0].body, '골드가 안 들어와요');

    // 알림이 실패해도 답은 남음 → notified:false
    notificationService().__internal.__setDepsForTests({ emitToUser: () => {}, db: { Notification: null } });
    const other = await makeInquiry(user, { title: '두 번째' });
    const failed = await agent.post(`/admin-api/inquiries/${other.id}/replies`, { requestId: crypto.randomUUID(), body: '확인했어요.' });
    assert.equal(failed.status, 201);
    assert.equal(failed.body.notified, false);
    assert.equal((await db().Inquiry.findByPk(other.id, { raw: true })).status, 'ANSWERED');
});

test('AD-282: 같은 requestId 두 번 → 답 하나·알림 하나·기록 하나', async (t) => {
    if (skipWithoutDb(t)) return;
    const sent = catchEmits(t);
    const { agent } = await adminTestApp({ t });
    const user = await makeUser();
    const inquiry = await makeInquiry(user);
    const requestId = crypto.randomUUID();
    const send = () => agent.post(`/admin-api/inquiries/${inquiry.id}/replies`, { requestId, body: '한 번만' });

    const [first, second] = await Promise.all([send(), send()]);
    const third = await send();
    for (const res of [first, second, third]) assert.equal(res.status, 201);
    assert.equal(new Set([first, second, third].map((res) => res.body.reply.id)).size, 1);
    assert.equal(await db().InquiryReply.count({ where: { inquiry_id: inquiry.id } }), 1);
    assert.equal(await db().Notification.count({ where: { user_id: user.uuid } }), 1);
    assert.equal(sent.length, 1);
    assert.equal(await db().AdminAuditLog.count({ where: { action: 'INQUIRY_REPLY', request_id: requestId } }), 1);

    // 같은 번호를 다른 문의에 쓰면 거절
    const other = await makeInquiry(user);
    const reused = await agent.post(`/admin-api/inquiries/${other.id}/replies`, { requestId, body: '한 번만' });
    assert.equal(reused.status, 409);
    assert.equal(reused.body.code, 'REQUEST_ID_REUSED');
});

test('AD-283: 목록 상태별·50줄씩, 문의 하나 보기, 없는 문의 404, 잘못된 값 400', async (t) => {
    if (skipWithoutDb(t)) return;
    catchEmits(t);
    const { agent, admin } = await adminTestApp({ t });
    const user = await makeUser();
    await db().InquiryReply.destroy({ where: {} });
    await db().Inquiry.destroy({ where: {} });
    for (let i = 0; i < 52; i += 1) await makeInquiry(user, { title: `열린 ${i}` });
    const answered = await makeInquiry(user, { title: '답한 것', status: 'ANSWERED' });

    const first = await agent.get('/admin-api/inquiries?status=OPEN');
    assert.equal(first.status, 200);
    assert.equal(first.body.items.length, 50);
    assert.ok(first.body.items.every((item) => item.status === 'OPEN'));
    assert.deepEqual(Object.keys(first.body.items[0]).sort(),
        ['answeredAt', 'category', 'createdAt', 'id', 'replyCount', 'status', 'title', 'user']);
    assert.deepEqual(first.body.items[0].user, { uuid: user.uuid, nickname: user.nickname });
    assert.equal(first.body.items[0].title, '열린 51');
    const second = await agent.get(`/admin-api/inquiries?status=OPEN&before=${first.body.nextBefore}`);
    assert.equal(second.body.items.length, 2);
    assert.equal(second.body.nextBefore, null);

    const done = await agent.get('/admin-api/inquiries?status=ANSWERED&limit=10');
    assert.deepEqual(done.body.items.map((item) => item.id), [Number(answered.id)]);
    assert.equal((await agent.get('/admin-api/inquiries')).body.items.length, 50);

    await agent.post(`/admin-api/inquiries/${answered.id}/replies`, { requestId: crypto.randomUUID(), body: '답' });
    const one = await agent.get(`/admin-api/inquiries/${answered.id}`);
    assert.equal(one.status, 200);
    assert.equal(one.body.inquiry.title, '답한 것');
    assert.equal(one.body.inquiry.body, '방 만들기 누르면 멈춤');
    assert.deepEqual(one.body.user, { uuid: user.uuid, nickname: user.nickname });
    assert.deepEqual(one.body.replies.map((reply) => [reply.body, reply.admin.loginId]), [['답', admin.loginId]]);

    for (const path of ['/admin-api/inquiries/99999999', '/admin-api/inquiries/abc']) {
        const missing = await agent.get(path);
        assert.equal(missing.status, 404, path);
        assert.equal(missing.body.code, 'INQUIRY_NOT_FOUND', path);
    }
    const noTarget = await agent.post('/admin-api/inquiries/99999999/replies', { requestId: crypto.randomUUID(), body: '답' });
    assert.equal(noTarget.status, 404);
    assert.equal(noTarget.body.code, 'INQUIRY_NOT_FOUND');

    const bad = [
        ['/admin-api/inquiries?status=DONE', 'status'],
        ['/admin-api/inquiries?limit=51', 'limit'],
        ['/admin-api/inquiries?page=2', 'page'],
    ];
    for (const [path, field] of bad) {
        const res = await agent.get(path);
        assert.equal(res.status, 400, path);
        assert.deepEqual([res.body.code, res.body.field], ['INVALID_INPUT', field], path);
    }
    const emptyBody = await agent.post(`/admin-api/inquiries/${answered.id}/replies`, { requestId: crypto.randomUUID(), body: '   ' });
    assert.deepEqual([emptyBody.status, emptyBody.body.field], [400, 'body']);
    const noRequest = await agent.post(`/admin-api/inquiries/${answered.id}/replies`, { body: '답' });
    assert.deepEqual([noRequest.status, noRequest.body.field], [400, 'requestId']);
});
