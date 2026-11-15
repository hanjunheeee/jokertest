'use strict';

// 이모티콘 팔레트(마이페이지) DB 시험: 처음 기본 8종·산 것 저장·안 가진 것·같은 것 두 칸·빈 칸·옛 revision·두 창 동시에·기본 지급 안 된 옛 계정을 시험 DB로 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-375~386 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3), 인게임 보내기는 A06 몫
process.env.DATABASE_URL = process.env.F01_TEST_DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const h = require('./a12-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');

test.before(h.prepareDb);
test.after(h.closeDb);

// 기본 8종 순서: 거절·눈물·분노·사랑·씨익·안녕·항복·헤롱
const BASIC = ['reject', 'tears', 'anger', 'love', 'grin', 'hello', 'surrender', 'dizzy'].map((slug) => `emoji-basic-${slug}`);
const SHUSH = 'emoji-shush'; // 상점 "쉿 조용히"

const readPalette = (base, uuid) => h.call(base, uuid, 'GET', '/user/me/emoji-palette');
const savePalette = (base, uuid, slots, expectedRevision) => h.call(base, uuid, 'PUT', '/user/me/emoji-palette', { slots, expectedRevision });

// 공통 준비: 서버 · 새 사람 · 처음 읽은 팔레트
const setup = async (t, { gold = 0 } = {}) => {
    const base = await h.startServer(t);
    const user = await h.createUser('emo');
    if (gold > 0) await h.fund(user, 'GOLD', gold);
    const first = await readPalette(base, user);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    return { base, user, first: first.body };
};

test('A12-B-375 새 계정 처음 읽기 → 칸 = 거절·눈물·분노·사랑·씨익·안녕·항복·헤롱 순·revision 있음·owned에 기본 8종', async (t) => {
    if (h.noDb(t)) return;
    const { first } = await setup(t);
    assert.deepEqual(first.slots, BASIC);
    assert.equal(typeof first.revision, 'string');
    assert.ok(first.revision.length > 0);
    for (const id of BASIC) assert.ok(first.owned.includes(id), `owned에 ${id} 없음`);
});

test('A12-B-376 산 "쉿 조용히"를 3번 칸에 저장 → 다시 읽으면 그대로·새 revision', async (t) => {
    if (h.noDb(t)) return;
    const { base, user, first } = await setup(t, { gold: 500 });
    assert.equal((await h.buy(base, user, SHUSH)).status, 201);
    const slots = [...BASIC];
    slots[2] = SHUSH;

    const saved = await savePalette(base, user, slots, first.revision);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const again = await readPalette(base, user);
    assert.deepEqual(again.body.slots, slots);
    assert.notEqual(again.body.revision, first.revision);
    assert.equal(again.body.revision, saved.body.revision);
});

test('A12-B-377 안 산 상점 이모티콘 → 400 NOT_OWNED·칸 그대로', async (t) => {
    if (h.noDb(t)) return;
    const { base, user, first } = await setup(t);
    const slots = [...BASIC];
    slots[0] = SHUSH;

    h.assertCode(await savePalette(base, user, slots, first.revision), 400, 'NOT_OWNED');
    assert.deepEqual((await readPalette(base, user)).body.slots, BASIC);
});

test('A12-B-378 같은 이모티콘 두 칸 → 400 INVALID_SLOTS', async (t) => {
    if (h.noDb(t)) return;
    const { base, user, first } = await setup(t);
    const slots = [...BASIC];
    slots[1] = BASIC[0];

    h.assertCode(await savePalette(base, user, slots, first.revision), 400, 'INVALID_SLOTS');
    assert.deepEqual((await readPalette(base, user)).body.slots, BASIC);
});

test('A12-B-379 7번 칸 null → 됨', async (t) => {
    if (h.noDb(t)) return;
    const { base, user, first } = await setup(t);
    const slots = [...BASIC];
    slots[6] = null;

    assert.equal((await savePalette(base, user, slots, first.revision)).status, 200);
    assert.deepEqual((await readPalette(base, user)).body.slots, slots);
});

test('A12-B-380 8칸 모두 빈 칸 → 됨 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const { base, user, first } = await setup(t);
    const slots = Array(8).fill(null);

    assert.equal((await savePalette(base, user, slots, first.revision)).status, 200);
    assert.deepEqual((await readPalette(base, user)).body.slots, slots);
});

test('A12-B-381 옛 revision → 409 REVISION_MISMATCH + 지금 칸·revision 같이', async (t) => {
    if (h.noDb(t)) return;
    const { base, user, first } = await setup(t);
    const changed = [...BASIC];
    changed[7] = null;
    const saved = await savePalette(base, user, changed, first.revision);
    assert.equal(saved.status, 200);

    const res = await savePalette(base, user, BASIC, first.revision);
    h.assertCode(res, 409, 'REVISION_MISMATCH');
    assert.deepEqual(res.body.slots, changed);
    assert.equal(res.body.revision, saved.body.revision);
});

test('A12-B-382 두 창이 같은 revision으로 동시 저장 → 하나만·다른 하나 409', async (t) => {
    if (h.noDb(t)) return;
    const { base, user, first } = await setup(t);
    const a = [...BASIC];
    a[0] = null;
    const b = [...BASIC];
    b[1] = null;

    const answers = await Promise.all([savePalette(base, user, a, first.revision), savePalette(base, user, b, first.revision)]);
    assert.deepEqual(answers.map((res) => res.status).sort(), [200, 409]);
    const winner = answers[0].status === 200 ? a : b;
    assert.deepEqual((await readPalette(base, user)).body.slots, winner);
});

test('A12-B-383 가진 테두리 id를 칸에 → 400 NOT_OWNED [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const { base, user, first } = await setup(t, { gold: 200 });
    assert.equal((await h.buy(base, user, 'profile-border-남작')).status, 201);
    const slots = [...BASIC];
    slots[4] = 'profile-border-남작';

    h.assertCode(await savePalette(base, user, slots, first.revision), 400, 'NOT_OWNED');
});

test('A12-B-384 상점에서 이모티콘 삼 → 팔레트 읽기 owned에 바로 있음', async (t) => {
    if (h.noDb(t)) return;
    const { base, user, first } = await setup(t, { gold: 500 });
    assert.ok(!first.owned.includes(SHUSH));
    assert.equal((await h.buy(base, user, SHUSH)).status, 201);

    const again = await readPalette(base, user);
    assert.ok(again.body.owned.includes(SHUSH));
});

test('A12-B-385 가진 것 0인 옛 계정 → 처음 읽기 때 기본 8종 받음', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('old');
    assert.equal((await h.entitlementsOf(user)).length, 0);

    const res = await readPalette(base, user);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    for (const id of BASIC) assert.ok(res.body.owned.includes(id), `owned에 ${id} 없음`);
    const ownedRows = (await h.entitlementsOf(user)).map((row) => row.item_id);
    for (const id of BASIC) assert.ok(ownedRows.includes(id), `가진 것 표에 ${id} 없음`);
});

test('A12-B-386 NOT_OWNED 거절 뒤 읽기 → 앞 칸·revision 그대로', async (t) => {
    if (h.noDb(t)) return;
    const { base, user, first } = await setup(t);
    const slots = [...BASIC];
    slots[3] = 'emoji-startled';
    assert.equal((await savePalette(base, user, slots, first.revision)).status, 400);

    const again = await readPalette(base, user);
    assert.deepEqual(again.body.slots, first.slots);
    assert.equal(again.body.revision, first.revision);
});
