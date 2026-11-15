'use strict';

// 같은 요청 두 번(겹침 막기) DB 시험: 같은 참조 번호 다시·동시에·다른 내용, 사람마다 번호, 결과 다시 묻기, 중간 실패 되돌림을 시험 DB로 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-281~293 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
process.env.DATABASE_URL = process.env.F01_TEST_DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const h = require('./a12-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');

test.before(h.prepareDb);
test.after(h.closeDb);

const BORDER = 'profile-border-남작'; // 200골드
const purchaseRows = async (uuid) => (await h.ledgerOf(uuid)).filter((row) => row.reason === 'PURCHASE');

test('A12-B-281 산 뒤 같은 몸 다시 → 200 idempotent:true·장부·지갑·가진 것 그대로', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('idem');
    await h.fund(user, 'GOLD', 1000);
    const first = await h.buy(base, user, BORDER, 'a12d-same');
    assert.equal(first.status, 201);
    const before = await h.fourTables(user);

    const again = await h.buy(base, user, BORDER, 'a12d-same');
    assert.equal(again.status, 200);
    assert.equal(again.body.idempotent, true);
    assert.deepEqual(await h.fourTables(user), before);
});

test('A12-B-282 같은 번호 동시에 두 요청 → 장부 1줄·골드 한 번만·두 답 결과 같음', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('race2');
    await h.fund(user, 'GOLD', 1000);

    const answers = await Promise.all([1, 2].map(() => h.buy(base, user, BORDER, 'a12d-race2')));
    for (const res of answers) assert.ok([200, 201].includes(res.status), JSON.stringify(res.body));
    assert.equal((await purchaseRows(user)).length, 1);
    assert.equal((await h.walletOf(user)).gold, 800);
    assert.deepEqual(answers[0].body.ledgerEntry, answers[1].body.ledgerEntry);
});

test('A12-B-283 같은 번호 동시에 다섯 → 장부 1줄·구매 요청 1줄', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('race5');
    await h.fund(user, 'GOLD', 1000);

    await Promise.all([1, 2, 3, 4, 5].map(() => h.buy(base, user, BORDER, 'a12d-race5')));
    assert.equal((await purchaseRows(user)).length, 1);
    assert.equal((await h.requestsOf(user)).length, 1);
    assert.equal((await h.walletOf(user)).gold, 800);
});

// ── A12-B-284~287 같은 번호에 다른 내용 [지금 동작] ──
// 처음 요청: 묶음 [남작, 자작] 번호 R → 그다음 같은 R로 몸만 바꿈
const CONFLICT_CASES = [
    { no: 'A12-B-284', label: '다른 아이템', items: ['profile-border-남작', 'profile-border-백작'], same: false },
    { no: 'A12-B-285', label: '아이템 하나 더', items: ['profile-border-남작', 'profile-border-자작', 'profile-border-백작'], same: false },
    { no: 'A12-B-286', label: '아이템 하나 덜', items: ['profile-border-남작'], same: false },
    { no: 'A12-B-287', label: '같은 아이템 순서만 바꿈', items: ['profile-border-자작', 'profile-border-남작'], same: true },
];

for (const c of CONFLICT_CASES) {
    test(`${c.no} 같은 번호에 ${c.label} → ${c.same ? '같은 요청(200)' : '409 REFERENCE_EVENT_CONFLICT·네 표 그대로'}`, async (t) => {
        if (h.noDb(t)) return;
        const base = await h.startServer(t);
        const user = await h.createUser('conf');
        await h.fund(user, 'GOLD', 5000);
        const first = await h.buyBulk(base, user, ['profile-border-남작', 'profile-border-자작'], 'a12d-conflict');
        assert.equal(first.status, 201, JSON.stringify(first.body));
        const before = await h.fourTables(user);

        const res = await h.buyBulk(base, user, c.items, 'a12d-conflict');
        if (c.same) {
            assert.equal(res.status, 200, JSON.stringify(res.body));
            assert.equal(res.body.idempotent, true);
        } else {
            h.assertCode(res, 409, 'REFERENCE_EVENT_CONFLICT');
        }
        assert.deepEqual(await h.fourTables(user), before);
    });
}

test('A12-B-288 번호 A로 산 뒤 번호 B로 같은 아이템 → 409 ITEM_ALREADY_OWNED·골드 한 번만', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('twice');
    await h.fund(user, 'GOLD', 1000);
    assert.equal((await h.buy(base, user, BORDER, 'a12d-ref-a')).status, 201);

    const res = await h.buy(base, user, BORDER, 'a12d-ref-b');
    h.assertCode(res, 409, 'ITEM_ALREADY_OWNED');
    assert.equal((await h.walletOf(user)).gold, 800);
    assert.equal((await purchaseRows(user)).length, 1);
});

test('A12-B-289 두 사람이 같은 번호로 각자 삼 → 둘 다 됨·서로 안 섞임 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const alice = await h.createUser('pa');
    const bob = await h.createUser('pb');
    await h.fund(alice, 'GOLD', 1000);
    await h.fund(bob, 'GOLD', 1000);

    const a = await h.buy(base, alice, 'profile-border-남작', 'a12d-shared-ref');
    const b = await h.buy(base, bob, 'profile-border-자작', 'a12d-shared-ref');
    assert.equal(a.status, 201, JSON.stringify(a.body));
    assert.equal(b.status, 201, JSON.stringify(b.body));
    assert.equal((await h.walletOf(alice)).gold, 800);
    assert.equal((await h.walletOf(bob)).gold, 700);
    assert.deepEqual((await purchaseRows(alice)).map((row) => row.item_id), ['profile-border-남작']);
    assert.deepEqual((await purchaseRows(bob)).map((row) => row.item_id), ['profile-border-자작']);
});

test('A12-B-290 응답 놓친 구매 다시 묻기 → GET /purchases/:번호가 처음 결과(장부 줄) 그대로', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('ask');
    await h.fund(user, 'GOLD', 1000);
    const first = await h.buy(base, user, BORDER, 'a12d-lost');
    assert.equal(first.status, 201);

    const res = await h.call(base, user, 'GET', '/economy/purchases/a12d-lost');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.kind, 'SINGLE');
    assert.equal(res.body.results.length, 1);
    assert.deepEqual(res.body.results[0], first.body.ledgerEntry);
});

test('A12-B-291 안 보낸 번호 다시 묻기 → 404 PURCHASE_RESULT_NOT_FOUND', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('ask');

    const res = await h.call(base, user, 'GET', '/economy/purchases/a12d-never-sent');
    h.assertCode(res, 404, 'PURCHASE_RESULT_NOT_FOUND');
});

test('A12-B-292 잔액 부족 거절 → 골드 채움 → 같은 번호 다시 → 됨 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('retry');

    h.assertCode(await h.buy(base, user, BORDER, 'a12d-retry'), 400, 'INSUFFICIENT_BALANCE');
    await h.fund(user, 'GOLD', 200);
    const res = await h.buy(base, user, BORDER, 'a12d-retry');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.idempotent, false);
    assert.equal((await h.walletOf(user)).gold, 0);
});

test('A12-B-293 묶음 둘째 아이템 쓰기에서 실패(가진 것 표에 같은 줄 미리 넣음) → 첫째 장부·골드도 안 남음', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('roll');
    await h.fund(user, 'GOLD', 2000);
    // 둘째 아이템 줄을 가진 것 표에 바로 넣어 둘째 쓰기가 막히게 함 (장부 없이)
    await h.models().EconomyEntitlement.create({ user_id: user, item_id: 'profile-border-후작', item_type: 'PROFILE_BORDER', source: 'PURCHASE' });
    const before = await h.fourTables(user);

    const res = await h.buyBulk(base, user, ['profile-border-남작', 'profile-border-후작']);
    assert.ok(res.status >= 400, JSON.stringify(res.body));
    assert.deepEqual(await h.fourTables(user), before);
    assert.equal((await purchaseRows(user)).length, 0);
    assert.equal((await h.walletOf(user)).gold, 2000);
});
