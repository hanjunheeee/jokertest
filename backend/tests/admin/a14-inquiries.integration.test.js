'use strict';

// 관리자 문의 시험: 상태별 목록·답하기(답함·알림·기록)·플레이어에겐 "운영팀"·접속 안 한 사람 알림·같은 요청 번호·다른 문의에 번호·길이 (시험 DB)
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-262~268 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const H = require('./a14-ops-helpers');
const { getMyInquiry } = require('../../services/inquiry/read');
const notifications = require('../../services/notification/manage');

const { db } = H;
const ctx = H.useAdminFile();

// 문의 한 줄 (플레이어가 쓴 것과 같은 모양), 시각은 ms로 차례 정함
async function addInquiry(userId, { status = 'OPEN', at = Date.now(), title = '결제 문의' } = {}) {
    return db.Inquiry.create({
        user_id: userId, category: 'ACCOUNT', title, body: '다이아가 안 들어왔어요', status,
        created_at: new Date(at), updated_at: new Date(at), answered_at: status === 'ANSWERED' ? new Date(at) : null,
    });
}

const reply = (id, body = '확인해 드렸어요', requestId = crypto.randomUUID()) => (
    ctx.app.agent.post(`/admin-api/inquiries/${id}/replies`, { requestId, body })
);

test('A14-B-262 OPEN 3·ANSWERED 1 → ?status=OPEN 내 것 3개, 최근 것 먼저', async (t) => {
    if (H.noDb(t)) return;
    const player = await H.createPlayer('i262');
    const base = Date.now() - 3_600_000;
    const open = [];
    for (let i = 0; i < 3; i += 1) open.push(await addInquiry(player.uuid, { at: base + i * 60_000 }));
    await addInquiry(player.uuid, { status: 'ANSWERED', at: base + 10 * 60_000 });
    const res = await ctx.app.agent.get('/admin-api/inquiries?status=OPEN');
    assert.equal(res.status, 200);
    const mine = res.body.items.filter((item) => item.user.uuid === player.uuid);
    assert.deepEqual(mine.map((item) => item.id), open.map((row) => Number(row.id)).reverse());
    assert.ok(mine.every((item) => item.status === 'OPEN'));
});

test('A14-B-263 답하기 → 답 줄·문의 ANSWERED·answered_at, 알림 출처 키 inquiry-reply:<번호>·target.kind inquiry, 기록 INQUIRY_REPLY', async (t) => {
    if (H.noDb(t)) return;
    const player = await H.createPlayer('i263');
    const inquiry = await addInquiry(player.uuid);
    const res = await reply(inquiry.id);
    assert.equal(res.status, 201);
    assert.equal(await db.InquiryReply.count({ where: { inquiry_id: inquiry.id } }), 1);
    const row = await db.Inquiry.findByPk(inquiry.id, { raw: true });
    assert.equal(row.status, 'ANSWERED');
    assert.ok(row.answered_at, 'answered_at 있음');
    const notes = await db.Notification.findAll({ where: { user_id: player.uuid }, raw: true });
    assert.equal(notes.length, 1);
    assert.match(notes[0].source_key, /^inquiry-reply:\d+$/);
    const target = H.parseJson(notes[0].target);
    assert.equal(target.kind, 'inquiry');
    assert.equal(Number(target.inquiryId), Number(inquiry.id));
    assert.equal((await H.myAudits(ctx.app.admin, { action: 'INQUIRY_REPLY', targetId: inquiry.id })).length, 1);
});

test('A14-B-264 답 뒤 플레이어가 문의를 보면 답 from "운영팀", 관리자 아이디 없음', async (t) => {
    if (H.noDb(t)) return;
    const player = await H.createPlayer('i264');
    const inquiry = await addInquiry(player.uuid);
    assert.equal((await reply(inquiry.id)).status, 201);
    const view = await getMyInquiry({ userId: player.uuid, inquiryId: String(inquiry.id) });
    assert.equal(view.replies.length, 1);
    assert.equal(view.replies[0].from, '운영팀');
    const text = JSON.stringify(view);
    assert.equal(text.includes(ctx.app.admin.loginId), false, '관리자 아이디 안 보임');
    assert.equal(text.includes(ctx.app.admin.id), false, '관리자 id 안 보임');
});

test('A14-B-265 접속 안 한 동안 답 → 다음 로그인 알림 목록에 그 알림', async (t) => {
    if (H.noDb(t)) return;
    const player = await H.createPlayer('i265');
    const inquiry = await addInquiry(player.uuid);
    const res = await reply(inquiry.id);
    assert.equal(res.status, 201);
    const list = await notifications.listForUser(player.uuid);
    const found = list.find((n) => n.sourceKey?.startsWith('inquiry-reply:'));
    assert.ok(found, '알림 목록에 문의 답 알림');
});

test('A14-B-266 같은 요청 번호로 두 번 → 답 줄 1개', async (t) => {
    if (H.noDb(t)) return;
    const player = await H.createPlayer('i266');
    const inquiry = await addInquiry(player.uuid);
    const requestId = crypto.randomUUID();
    assert.equal((await reply(inquiry.id, '첫 답', requestId)).status, 201);
    const again = await reply(inquiry.id, '첫 답', requestId);
    assert.ok(again.status < 300, `두 번째 상태 ${again.status}`);
    assert.equal(await db.InquiryReply.count({ where: { inquiry_id: inquiry.id } }), 1);
});

test('A14-B-267 문의 ㄱ에 쓴 요청 번호로 문의 ㄴ 답 → 409 REQUEST_ID_REUSED, ㄴ 그대로', async (t) => {
    if (H.noDb(t)) return;
    const player = await H.createPlayer('i267');
    const first = await addInquiry(player.uuid);
    const second = await addInquiry(player.uuid);
    const requestId = crypto.randomUUID();
    assert.equal((await reply(first.id, '답', requestId)).status, 201);
    const res = await reply(second.id, '답', requestId);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'REQUEST_ID_REUSED');
    const row = await db.Inquiry.findByPk(second.id, { raw: true });
    assert.equal(row.status, 'OPEN');
    assert.equal(await db.InquiryReply.count({ where: { inquiry_id: second.id } }), 0);
});

test('A14-B-268 답 2001자 → 400 field body (2000자는 됨), 없는 문의 → 404 INQUIRY_NOT_FOUND', async (t) => {
    if (H.noDb(t)) return;
    const player = await H.createPlayer('i268');
    const inquiry = await addInquiry(player.uuid);
    H.assertInvalid(await reply(inquiry.id, '가'.repeat(2001)), 'body');
    assert.equal(await db.InquiryReply.count({ where: { inquiry_id: inquiry.id } }), 0);
    assert.equal((await reply(inquiry.id, '가'.repeat(2000))).status, 201);
    const missing = await reply(999_999_999);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'INQUIRY_NOT_FOUND');
});
