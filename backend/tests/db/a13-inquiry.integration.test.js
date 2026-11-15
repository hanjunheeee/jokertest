'use strict';

// 플레이어 문의 DB 시험 — 쓰기, 1분 2번·하루 10번·답 기다림 5개, 금지어 가림, 남의 문의 404, 내 목록 50줄, 답 달린 뒤 상세
// 목록 A13-B-399~410 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 관리자가 답하기는 A14 몫
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a13-inquiry.integration.test.js
const W = require('./a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, createUser, login } = W;
const write = require('../../services/inquiry/write');
const bannedWords = require('../../services/ops/bannedWords');
const noDb = W.useTestDb(test);

const RATE_MESSAGE = '문의를 너무 자주 썼어요. 잠시 뒤에 다시 써 주세요.';
const OPEN_MESSAGE = '답을 기다리는 문의가 5개예요. 답을 받은 뒤에 써 주세요.';
const form = (n = 1) => ({ category: 'BUG', title: `버그 ${n}`, body: `설정 버튼이 안 눌림 ${n}` });

async function setup(t) {
    const call = await W.startServer(t);
    const me = await createUser('me');
    return { call, me, cookie: await login(me) };
}
const post = (call, cookie, body) => call('POST', '/inquiries', { cookie, body });
// 문의 줄 바로 넣기 (minutesAgo 분 전, 바꿀 칸만 fields)
const insertInquiry = (userId, { minutesAgo = 120, ...fields } = {}) => {
    const at = new Date(Math.floor(Date.now() / 1000) * 1000 - minutesAgo * 60_000);
    return db.Inquiry.create({ user_id: userId, category: 'ETC', title: '예전 문의', body: '본문', status: 'OPEN', created_at: at, updated_at: at, ...fields });
};

test('A13-B-399 POST /inquiries { category: BUG, title, body } → inquiries 1줄 OPEN, 답 상세(답 없음)', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    const res = await post(call, cookie, form());
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const rows = await db.Inquiry.findAll({ where: { user_id: me }, raw: true });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'OPEN');
    assert.equal(res.body.inquiry.title, '버그 1');
    assert.equal(res.body.inquiry.body, '설정 버튼이 안 눌림 1');
    assert.deepEqual(res.body.inquiry.replies, []);
});

test('A13-B-400 1분 안 2번째 문의 → 됨', async (t) => {
    if (noDb(t)) return;
    const { call, cookie } = await setup(t);
    assert.equal((await post(call, cookie, form(1))).status, 201);
    assert.equal((await post(call, cookie, form(2))).status, 201);
});

test('A13-B-401 1분 안 3번째 문의 → 429 INQUIRY_RATE_LIMITED "문의를 너무 자주 썼어요. 잠시 뒤에 다시 써 주세요."', async (t) => {
    if (noDb(t)) return;
    const { call, cookie } = await setup(t);
    for (const n of [1, 2]) assert.equal((await post(call, cookie, form(n))).status, 201);
    const res = await post(call, cookie, form(3));
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'INQUIRY_RATE_LIMITED');
    assert.equal(res.body.message, RATE_MESSAGE);
});

// 가짜 시각으로 2분씩 띄워 n번 씀 (앞 것은 답 받음 처리) → 마지막 결과 또는 오류
async function writeSpaced(me, n) {
    const start = Math.floor(Date.now() / 1000) * 1000 - 2 * 60 * 60_000;
    let last = null;
    for (let i = 0; i < n; i += 1) {
        const deps = { db, bannedWords, now: () => new Date(start + i * 2 * 60_000) };
        try {
            last = { ok: true, inquiry: await write.createInquiry({ userId: me, body: form(i + 1) }, deps) };
        } catch (error) {
            last = { ok: false, status: error.status, code: error.code, message: error.message };
        }
        await db.Inquiry.update({ status: 'ANSWERED' }, { where: { user_id: me } });
    }
    return last;
}

test('A13-B-402 하루 10번째 문의(2분씩 띄움, 앞 것은 답 받음) → 됨', async (t) => {
    if (noDb(t)) return;
    const me = await createUser('me');
    const last = await writeSpaced(me, 10);
    assert.equal(last.ok, true, `${last.code} ${last.message}`);
});

test('A13-B-403 하루 11번째 문의 → 429', async (t) => {
    if (noDb(t)) return;
    const me = await createUser('me');
    const last = await writeSpaced(me, 11);
    assert.equal(last.ok, false);
    assert.equal(last.status, 429);
});

test('A13-B-404 OPEN 5개 → 6번째 409 INQUIRY_OPEN_LIMIT "답을 기다리는 문의가 5개예요. 답을 받은 뒤에 써 주세요."', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    for (let i = 0; i < 5; i += 1) await insertInquiry(me);
    const res = await post(call, cookie, form());
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'INQUIRY_OPEN_LIMIT');
    assert.equal(res.body.message, OPEN_MESSAGE);
});

test('A13-B-405 OPEN 5개 중 하나 ANSWERED 뒤 → 됨', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    const rows = [];
    for (let i = 0; i < 5; i += 1) rows.push(await insertInquiry(me));
    await db.Inquiry.update({ status: 'ANSWERED', answered_at: new Date() }, { where: { id: rows[0].id } });
    const res = await post(call, cookie, form());
    assert.equal(res.status, 201, JSON.stringify(res.body));
});

test('A13-B-406 금지어 "바보" 든 제목·본문 → 저장값 **', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    bannedWords.__setWordsForTests(['바보']);
    t.after(() => bannedWords.__setWordsForTests([]));
    const res = await post(call, cookie, { category: 'ETC', title: '바보 같은 버그', body: '이건 바보 같음' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const [row] = await db.Inquiry.findAll({ where: { user_id: me }, raw: true });
    assert.equal(row.title, '** 같은 버그');
    assert.equal(row.body, '이건 ** 같음');
});

test('A13-B-407 남의 문의 상세 → 404', async (t) => {
    if (noDb(t)) return;
    const { call, cookie } = await setup(t);
    const other = await createUser('ot');
    const theirs = await insertInquiry(other);
    const res = await call('GET', `/inquiries/${theirs.id}`, { cookie });
    assert.equal(res.status, 404);
});

// A13-B-408~409 문의 n개 → 내 목록 50줄, 최근 것부터
for (const [no, n] of [['A13-B-408', 50], ['A13-B-409', 51]]) {
    test(`${no} 문의 ${n}개 → 내 목록 50줄${n > 50 ? ', 최근 것부터' : ''}`, async (t) => {
        if (noDb(t)) return;
        const { call, me, cookie } = await setup(t);
        const rows = [];
        // i분 전 (0번이 가장 최근)
        for (let i = 0; i < n; i += 1) rows.push(await insertInquiry(me, { minutesAgo: i + 1, status: 'ANSWERED' }));
        const res = await call('GET', '/inquiries', { cookie });
        assert.equal(res.status, 200);
        assert.equal(res.body.inquiries.length, 50);
        assert.deepEqual(res.body.inquiries.map((r) => String(r.id)), rows.slice(0, 50).map((r) => String(r.id)));
    });
}

test('A13-B-410 답 줄 넣음 → 상세에 답 글·보낸 이 "운영팀"·상태 ANSWERED', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    const mine = await insertInquiry(me);
    const adminId = crypto.randomUUID();
    await db.AdminUser.create({ id: adminId, login_id: `a13adm${adminId.slice(0, 6)}`, password_hash: 'not-a-real-hash', role: 'VIEWER' });
    await db.InquiryReply.create({ inquiry_id: mine.id, admin_id: adminId, body: '고쳤어요. 다시 해 보세요.' });
    await db.Inquiry.update({ status: 'ANSWERED', answered_at: new Date() }, { where: { id: mine.id } });
    const res = await call('GET', `/inquiries/${mine.id}`, { cookie });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.inquiry.status, 'ANSWERED');
    assert.equal(res.body.inquiry.replies.length, 1);
    assert.equal(res.body.inquiry.replies[0].body, '고쳤어요. 다시 해 보세요.');
    assert.equal(res.body.inquiry.replies[0].from, '운영팀');
});
