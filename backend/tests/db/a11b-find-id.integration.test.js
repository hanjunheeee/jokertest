'use strict';

// 아이디(메일) 찾기 시험(시험 DB, 진짜 경로) — 맞으면 가린 이메일·어디가 틀렸는지 안 드러남·모양 틀림·닉네임/ip 요청 수 제한·옛 긴 닉네임·탈퇴 계정·캐시·조회 기록 줄
// 목록 A11-B-681~696·871~872 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const h = require('./a11b-harness');

const test = require('node:test');
const assert = require('node:assert/strict');

const { db, noDb } = h;
const PATH = '/auth/find-id';
const BIRTH = '1995-05-05';
// 못 찾음은 어디서 틀렸든 같은 본문 (F29 2-1)
const NOT_FOUND = JSON.stringify({ ok: false, code: 'NOT_FOUND' });

test.before(h.prepareDb);
test.after(h.closeDb);

const find = (app, nickname, birthDate = BIRTH) => app.post(PATH, { nickname, birthDate });
// 없는 닉네임 (영문 소문자·숫자, 8자)
const noNick = () => `zz${h.tail()}`.slice(0, 8);

test('A11-B-681 닉네임·생일 맞음 → 200 { ok:true, maskedEmail }, 원문 이메일 아님', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix: 'f', birthDate: BIRTH });
    const res = await find(app, user.nickname);
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ['maskedEmail', 'ok']);
    assert.equal(res.body.ok, true);
    assert.equal(typeof res.body.maskedEmail, 'string');
    assert.notEqual(res.body.maskedEmail, user.email);
    assert.ok(!res.text.includes(user.email), '응답에 원문 이메일이 있음');
    assert.ok(res.body.maskedEmail.includes('*'), '가린 표시가 없음');
});

// ── 어디가 틀렸는지 안 드러남 (682~685) ──

const MISSES = [
    ['A11-B-682', '닉네임 틀림', async () => {
        await h.createLocalUser({ prefix: 'fn', birthDate: BIRTH });
        return [noNick(), BIRTH];
    }],
    ['A11-B-683', '생일 틀림', async () => {
        const user = await h.createLocalUser({ prefix: 'fb', birthDate: BIRTH });
        return [user.nickname, '1990-01-01'];
    }],
    ['A11-B-684', '생일 없는 계정', async () => {
        const user = await h.createLocalUser({ prefix: 'fe', birthDate: BIRTH });
        await db.User.update({ birth_date: null }, { where: { uuid: user.uuid } });
        return [user.nickname, BIRTH];
    }],
    ['A11-B-685', '없는 닉네임', async () => [noNick(), BIRTH]],
];

for (const [id, name, prepare] of MISSES) {
    test(`${id} 아이디 찾기 ${name} → 200 { ok:false, code:NOT_FOUND }, 본문 바이트까지 같음`, async (t) => {
        if (noDb(t)) return;
        const app = await h.startApp(t);
        const [nickname, birthDate] = await prepare();
        const res = await find(app, nickname, birthDate);
        assert.equal(res.status, 200);
        assert.equal(res.text, NOT_FOUND);
    });
}

// ── 모양 틀림 (686~688) ──

const BAD = [
    ['A11-B-686', '본문 없음', (app) => app.call('POST', PATH)],
    ['A11-B-687', '닉네임 1자', (app) => find(app, '가')],
    ['A11-B-688', '생일 2000/01/01', (app) => find(app, '가면쓴이', '2000/01/01')],
];

for (const [id, name, send] of BAD) {
    test(`${id} 아이디 찾기 ${name} → 400 INVALID_INPUT`, async (t) => {
        if (noDb(t)) return;
        const app = await h.startApp(t);
        const res = await send(app);
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'INVALID_INPUT');
    });
}

// ── 같은 닉네임 10분 5번 (689~691) ──

async function sameNickTimes(app, nickname, n) {
    let res = null;
    for (let i = 0; i < n; i += 1) res = await find(app, nickname);
    return res;
}

test('A11-B-689 같은 닉네임 5번째 → 200', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const res = await sameNickTimes(app, noNick(), 5);
    assert.equal(res.status, 200);
});

test('A11-B-690 같은 닉네임 6번째 → 429', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const res = await sameNickTimes(app, noNick(), 6);
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
});

test('A11-B-691 같은 닉네임 막힌 뒤 가짜 시계 10분 → 다시 200', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t, { clock: true });
    const nickname = noNick();
    assert.equal((await sameNickTimes(app, nickname, 6)).status, 429, '준비: 6번째 막힘');
    app.clock.tick(10 * 60 * 1000);
    const res = await find(app, nickname);
    assert.equal(res.status, 200);
});

// ── 같은 ip 10분 10번 (692~693) ──

async function differentNicks(app, n) {
    let res = null;
    for (let i = 0; i < n; i += 1) res = await find(app, noNick());
    return res;
}

test('A11-B-692 같은 ip 다른 닉네임 10번째 → 200', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const res = await differentNicks(app, 10);
    assert.equal(res.status, 200);
});

test('A11-B-693 같은 ip 다른 닉네임 11번째 → 429', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const res = await differentNicks(app, 11);
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
});

test('A11-B-694 옛 긴 닉네임(9자) 계정(DB에 직접) → 찾음', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix: 'fl', birthDate: BIRTH });
    const longNick = `long${h.tail()}`.padEnd(9, 'x').slice(0, 9);
    await db.User.update({ nickname: longNick }, { where: { uuid: user.uuid } });
    const res = await find(app, longNick);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(typeof res.body.maskedEmail, 'string');
});

test('A11-B-695 탈퇴한 계정은 탈퇴 전 닉네임·생일로 못 찾음 → NOT_FOUND', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix: 'fw', birthDate: BIRTH });
    assert.equal((await find(app, user.nickname)).body.ok, true, '준비: 탈퇴 전엔 찾음');
    const session = await h.sessionFor(user.uuid);
    assert.equal((await app.post('/user/me/withdraw', { password: user.password }, { cookie: session.cookie })).status, 200, '준비: 탈퇴');
    const res = await find(app, user.nickname);
    assert.equal(res.status, 200);
    assert.equal(res.text, NOT_FOUND);
});

test('A11-B-696 아이디 찾기 응답 Cache-Control: no-store', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const res = await find(app, noNick());
    assert.equal(res.headers.get('cache-control'), 'no-store');
});

// ── 조회 기록 줄 (871~872) ──

// 찾기 한 번 앞뒤로 새로 생긴 기록 줄
async function newFindRows(send) {
    const lastId = (await db.AccountFindRequest.max('id')) ?? 0;
    await send();
    return db.AccountFindRequest.findAll({ where: { id: { [db.Sequelize.Op.gt]: lastId } }, raw: true });
}

// 줄 모양: FIND_ID 하나, ip만, 이메일·생일 없음
function assertFindRow(rows, user) {
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.equal(row.request_type, 'FIND_ID');
    assert.equal(typeof row.ip_address, 'string');
    assert.ok(row.ip_address.length > 0, 'ip가 빔');
    assert.equal(row.email, null);
    const text = JSON.stringify(row);
    assert.ok(!text.includes(user.email), '기록에 이메일 원문이 있음');
    assert.ok(!text.includes(BIRTH), '기록에 생일이 있음');
    assert.ok(!('birth_date' in row) || row.birth_date == null, '기록에 생일 칸이 있음');
}

test('A11-B-871 아이디 찾기 맞음 → account_find_requests에 FIND_ID 한 줄, ip만', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix: 'fr', birthDate: BIRTH });
    let res = null;
    const rows = await newFindRows(async () => { res = await find(app, user.nickname); });
    assert.equal(res.body.ok, true, '준비: 찾음');
    assertFindRow(rows, user);
});

test('A11-B-872 아이디 찾기 못 찾음 → account_find_requests에 FIND_ID 한 줄, ip만', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix: 'fx', birthDate: BIRTH });
    let res = null;
    const rows = await newFindRows(async () => { res = await find(app, user.nickname, '1990-01-01'); });
    assert.equal(res.body.ok, false, '준비: 못 찾음');
    assertFindRow(rows, user);
});
