'use strict';

// 알림 DB 시험 — 목록 최근 100개·숨김·남의 것 빼기, 읽음 표시(처음 시각 지킴·동시에 둘), id 모양·남의 알림, 읽은 것 지우기, 환영 안내 숨김, 업적 알림 모양
// 목록 A13-B-374~385 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a13-notification.integration.test.js
const W = require('./a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, createUser, login } = W;
const notificationService = require('../../services/notification');
const noDb = W.useTestDb(test);

// 알림 줄 바로 넣기 (minutesAgo 분 전, 바꿀 칸만 fields)
let noteSeq = 0;
async function insertNote(userId, { minutesAgo = 0, ...fields } = {}) {
    noteSeq += 1;
    const base = Math.floor(Date.now() / 1000) * 1000;
    return db.Notification.create({
        id: crypto.randomUUID(),
        user_id: userId,
        type: 'friend-request',
        source_key: `a13-note:${noteSeq}:${crypto.randomUUID().slice(0, 8)}`,
        title: '새 친구 요청',
        body: `알림 ${noteSeq}`,
        target: null,
        created_at: new Date(base - minutesAgo * 60_000),
        read_at: null,
        ...fields,
    });
}
// 서버 + 로그인한 나
async function setup(t) {
    const call = await W.startServer(t);
    const me = await createUser('me');
    return { call, me, cookie: await login(me) };
}
const listIds = async (call, cookie) => {
    const res = await call('GET', '/notifications', { cookie });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.data.map((n) => n.id);
};
const readAtOf = async (id) => (await db.Notification.findByPk(id, { raw: true })).read_at;

// A13-B-374~375 알림 n개 → 목록 100개, 최근 것부터
for (const [no, n] of [['A13-B-374', 100], ['A13-B-375', 101]]) {
    test(`${no} 알림 ${n}개 → 목록 100개${n > 100 ? ', 가장 옛 것 빠짐·최근 것부터' : ''}`, async (t) => {
        if (noDb(t)) return;
        const { call, me, cookie } = await setup(t);
        const rows = [];
        // i분 전 (0번이 가장 최근)
        for (let i = 0; i < n; i += 1) rows.push(await insertNote(me, { minutesAgo: i }));
        const ids = await listIds(call, cookie);
        assert.equal(ids.length, 100);
        assert.deepEqual(ids, rows.slice(0, 100).map((r) => r.id));
        if (n > 100) assert.equal(ids.includes(rows[100].id), false);
    });
}

test('A13-B-376 내 알림 2 + 숨김(hidden) 1 + 남의 알림 3 → 2개', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    const mine = [await insertNote(me), await insertNote(me, { minutesAgo: 1 })];
    await insertNote(me, { type: 'hidden', minutesAgo: 2 });
    const other = await createUser('ot');
    for (let i = 0; i < 3; i += 1) await insertNote(other);
    assert.deepEqual((await listIds(call, cookie)).sort(), mine.map((r) => r.id).sort());
});

test('A13-B-377 PATCH /notifications/<id>/read → read_at 채움, 답 readAt = 그 시각', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    const note = await insertNote(me);
    const res = await call('PATCH', `/notifications/${note.id}/read`, { cookie });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const saved = await readAtOf(note.id);
    assert.ok(saved, 'read_at 비어 있음');
    assert.equal(new Date(res.body.data.readAt).getTime(), new Date(saved).getTime());
});

test('A13-B-378 읽음 → 1분 뒤 다시 → read_at 처음 시각 그대로', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    const note = await insertNote(me);
    const first = Math.floor(Date.now() / 1000) * 1000;
    notificationService.__internal.__setDepsForTests({ now: () => new Date(first) });
    t.after(() => notificationService.__internal.__setDepsForTests(null));
    assert.equal((await call('PATCH', `/notifications/${note.id}/read`, { cookie })).status, 200);
    notificationService.__internal.__setDepsForTests({ now: () => new Date(first + 60_000) });
    const again = await call('PATCH', `/notifications/${note.id}/read`, { cookie });
    assert.equal(again.status, 200);
    assert.equal(new Date(await readAtOf(note.id)).getTime(), first);
    assert.equal(new Date(again.body.data.readAt).getTime(), first);
});

test('A13-B-379 같은 알림을 동시에 두 번 읽음 → 두 답 모두 readAt 있음·같은 값', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    const note = await insertNote(me);
    const answers = await Promise.all([1, 2].map(() => call('PATCH', `/notifications/${note.id}/read`, { cookie })));
    for (const a of answers) {
        assert.equal(a.status, 200, JSON.stringify(a.body));
        assert.ok(a.body.data.readAt, 'readAt 없음');
    }
    assert.equal(answers[0].body.data.readAt, answers[1].body.data.readAt);
});

test('A13-B-380 PATCH /notifications/abc/read → 400 "유효하지 않은 알림 id입니다."', async (t) => {
    if (noDb(t)) return;
    const { call, cookie } = await setup(t);
    const res = await call('PATCH', '/notifications/abc/read', { cookie });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, '유효하지 않은 알림 id입니다.');
});

test('A13-B-381 남의 알림 읽음 → 404 "알림을 찾을 수 없습니다.", 그 줄 read_at 빈 값 그대로', async (t) => {
    if (noDb(t)) return;
    const { call, cookie } = await setup(t);
    const other = await createUser('ot');
    const note = await insertNote(other);
    const res = await call('PATCH', `/notifications/${note.id}/read`, { cookie });
    assert.equal(res.status, 404);
    assert.equal(res.body.message, '알림을 찾을 수 없습니다.');
    assert.equal(await readAtOf(note.id), null);
});

test('A13-B-382 읽음 2·안 읽음 1·남의 읽음 1 → 내 읽음 2만 지움, deletedCount 2, 안 읽음·남의 것 남음', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    const read = [await insertNote(me, { read_at: new Date() }), await insertNote(me, { read_at: new Date() })];
    const unread = await insertNote(me);
    const other = await createUser('ot');
    const othersRead = await insertNote(other, { read_at: new Date() });
    const res = await call('DELETE', '/notifications/read', { cookie });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.deletedCount, 2);
    for (const r of read) assert.equal(await db.Notification.findByPk(r.id), null);
    assert.ok(await db.Notification.findByPk(unread.id), '안 읽음이 지워짐');
    assert.ok(await db.Notification.findByPk(othersRead.id), '남의 것이 지워짐');
});

// 환영 안내 하나 만들고 읽음 → 읽은 알림 지우기
async function welcomeReadAndCleared(call, me, cookie) {
    const made = await notificationService.ensureSystemWelcome(me);
    assert.equal(made.created, true);
    assert.equal((await call('PATCH', `/notifications/${made.notification.id}/read`, { cookie })).status, 200);
    assert.equal((await call('DELETE', '/notifications/read', { cookie })).status, 200);
    return made.notification.id;
}

test('A13-B-383 읽은 환영 안내 지우기 → 줄은 남고 type hidden, 목록에서 빠짐', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    const id = await welcomeReadAndCleared(call, me, cookie);
    const row = await db.Notification.findByPk(id, { raw: true });
    assert.ok(row, '줄이 지워짐');
    assert.equal(row.type, 'hidden');
    assert.equal((await listIds(call, cookie)).includes(id), false);
});

test('A13-B-384 지운 환영 안내 → 다음 notifications_ready(환영 만들기) 때 새로 안 생김', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    await welcomeReadAndCleared(call, me, cookie);
    const again = await notificationService.ensureSystemWelcome(me);
    assert.equal(again.created, false);
    assert.equal(await db.Notification.count({ where: { user_id: me, source_key: notificationService.SYSTEM_WELCOME.sourceKey } }), 1);
    assert.deepEqual(await listIds(call, cookie), []);
});

test('A13-B-385 업적 받음 → 알림 type achievement, 제목 "업적 달성", 본문, target { kind: achievement, achievementId }, source_key achievement:<id>:granted', async (t) => {
    if (noDb(t)) return;
    const me = await createUser('me');
    const achievementId = 'record-1-masquerade';
    await db.sequelize.transaction((transaction) => notificationService.createForAchievement({ userId: me, achievementId }, { db, transaction }));
    const rows = await db.Notification.findAll({ where: { user_id: me }, raw: true });
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.type, 'achievement');
    assert.equal(row.title, '업적 달성');
    assert.equal(row.body, '새 업적을 달성해 보상을 받았습니다. 기억의 서고에서 확인하세요.');
    const target = typeof row.target === 'string' ? JSON.parse(row.target) : row.target;
    assert.deepEqual(target, { kind: 'achievement', achievementId });
    assert.equal(row.source_key, `achievement:${achievementId}:granted`);
});
