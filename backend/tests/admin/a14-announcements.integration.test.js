'use strict';

// 관리자 공지 시험: 고른 회원·같은 요청 번호 두 번·없는 UUID 섞음·접속 중 전체·제목 본문 길이 (진짜 관리자 경로 + 시험 DB + 가짜 소켓)
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-245~250 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const H = require('./a14-ops-helpers');

const { db } = H;
const ctx = H.useAdminFile();

const send = (body) => ctx.app.agent.post('/admin-api/announcements', body);
const users = (userUuids, overrides = {}) => ({
    requestId: crypto.randomUUID(), title: '점검 안내', body: '오늘 밤 점검이 있어요', target: 'users', userUuids, ...overrides,
});
// 그 공지(요청 번호)로 생긴 알림 줄
const notesOf = (requestId) => db.Notification.findAll({ where: { source_key: `announcement:${requestId}` }, raw: true });

test('A14-B-245 3명 고름 → 알림 3줄, recipientCount 3·created 3·duplicated 0·failed 0, 기록 ANNOUNCE after에 제목·본문·대상·고른 수·결과 수', async (t) => {
    if (H.noDb(t)) return;
    const picked = await Promise.all(['n245a', 'n245b', 'n245c'].map((label) => H.createPlayer(label)));
    const body = users(picked.map((p) => p.uuid));
    const res = await send(body);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.result, { recipientCount: 3, created: 3, duplicated: 0, failed: 0 });
    const notes = await notesOf(body.requestId);
    assert.deepEqual(notes.map((n) => n.user_id).sort(), picked.map((p) => p.uuid).sort());
    const [audit] = await H.myAudits(ctx.app.admin, { action: 'ANNOUNCE', targetId: body.requestId });
    assert.ok(audit, '기록 한 줄');
    assert.equal(audit.after_value.title, body.title);
    assert.equal(audit.after_value.body, body.body);
    assert.equal(audit.after_value.target, 'users');
    assert.equal(audit.after_value.selectedCount, 3);
    assert.equal(audit.after_value.recipientCount, 3);
    assert.equal(audit.after_value.created, 3);
    assert.equal(audit.after_value.duplicated, 0);
    assert.equal(audit.after_value.failed, 0);
});

test('A14-B-246 같은 requestId로 두 번 → 알림 3줄 그대로, 두 번째 duplicated 3', async (t) => {
    if (H.noDb(t)) return;
    const picked = await Promise.all(['n246a', 'n246b', 'n246c'].map((label) => H.createPlayer(label)));
    const body = users(picked.map((p) => p.uuid));
    assert.equal((await send(body)).status, 200);
    const again = await send(body);
    assert.equal(again.status, 200);
    assert.equal(again.body.result.duplicated, 3);
    assert.equal(again.body.result.created, 0);
    assert.equal((await notesOf(body.requestId)).length, 3);
});

test('A14-B-247 있는 2명 + 없는 UUID 1 → failed 1, 있는 2명은 받음', async (t) => {
    if (H.noDb(t)) return;
    const picked = await Promise.all(['n247a', 'n247b'].map((label) => H.createPlayer(label)));
    const body = users([...picked.map((p) => p.uuid), crypto.randomUUID()]);
    const res = await send(body);
    assert.equal(res.status, 200);
    assert.equal(res.body.result.failed, 1);
    assert.equal(res.body.result.created, 2);
    assert.deepEqual((await notesOf(body.requestId)).map((n) => n.user_id).sort(), picked.map((p) => p.uuid).sort());
});

test('A14-B-248 접속 소켓 2개 + 안 접속 1명 → target online → 소켓 둘이 알림 받음, recipientCount 2', async (t) => {
    if (H.noDb(t)) return;
    const online = H.fakeOnline(t);
    const [a, b, off] = await Promise.all(['n248a', 'n248b', 'n248c'].map((label) => H.createPlayer(label)));
    const sockA = online.connect(a.uuid);
    const sockB = online.connect(b.uuid);
    const body = { requestId: crypto.randomUUID(), title: '접속 공지', body: '지금 접속한 분께', target: 'online' };
    const res = await send(body);
    assert.equal(res.status, 200);
    assert.equal(res.body.result.recipientCount, 2);
    for (const sock of [sockA, sockB]) {
        const got = online.got(sock, 'notification_created');
        assert.equal(got.length, 1);
        assert.equal(got[0].notification.title, '접속 공지');
    }
    const notes = await notesOf(body.requestId);
    assert.equal(notes.some((n) => n.user_id === off.uuid), false, '안 접속한 사람은 대상 아님');
});

// A14-B-249~250 길이 (값 2)
test('A14-B-249 제목 121자 → 400 field title, 120자 → 200', async (t) => {
    if (H.noDb(t)) return;
    const player = await H.createPlayer('n249');
    const long = users([player.uuid], { title: '가'.repeat(121) });
    H.assertInvalid(await send(long), 'title');
    assert.equal((await notesOf(long.requestId)).length, 0);
    const fit = users([player.uuid], { title: '가'.repeat(120) });
    assert.equal((await send(fit)).status, 200);
    assert.equal((await notesOf(fit.requestId)).length, 1);
});

test('A14-B-250 본문 501자 → 400 field body, 알림 없음', async (t) => {
    if (H.noDb(t)) return;
    const player = await H.createPlayer('n250');
    const long = users([player.uuid], { body: '가'.repeat(501) });
    H.assertInvalid(await send(long), 'body');
    assert.equal((await notesOf(long.requestId)).length, 0);
});
