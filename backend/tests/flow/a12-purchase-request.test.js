'use strict';

// 아이템 구매 요청 몸 검사 시험: 진짜 경제 경로(/economy/purchase·/purchases/bulk)에 요청 보내고 상태·코드·지갑·장부를 가짜 DB로 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-081~093 (돌리기: node --env-file=.env.test --test tests/flow/a12-purchase-request.test.js)
const test = require('node:test');
const assert = require('node:assert/strict');

const w = require('./a12-request-world');

// 파는 테두리 하나 (200골드)
const ITEM = 'profile-border-남작';
const ITEM2 = 'profile-border-자작';

// 서버·가짜 DB·골드 1000 가진 사람 하나
const setup = async (t) => {
    const base = await w.startApp(t);
    const { db } = w.economyDb(t);
    const me = w.uid('a12-buy');
    w.seedWallet(db, me, { gold: 1_000 });
    return { base, db, me, cookie: w.login(me) };
};

// 400 + 코드(주면) + 가짜 DB 하나도 안 바뀜
const assertRejectedUnchanged = async (ctx, path, body, code) => {
    const before = w.economyState(ctx.db);
    const res = await w.call(ctx.base, 'POST', path, { cookie: ctx.cookie, body });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    if (code) assert.equal(res.body.code, code);
    assert.equal(w.economyState(ctx.db), before, '지갑·장부·가진 것·구매 요청이 바뀜');
    return res;
};

// ── A12-B-081~088: 묶음 구매 몸 검사 (서비스 부르기 전 거절) ──

const BULK_BODIES = [
    ['A12-B-081', '몸에 모르는 칸 price', { referenceEventId: 'r-081', items: [{ itemId: ITEM }], price: 1 }, 'UNKNOWN_BULK_PURCHASE_FIELD'],
    ['A12-B-082', 'items[] 안 priceGold', { referenceEventId: 'r-082', items: [{ itemId: ITEM, priceGold: 1 }] }, 'UNKNOWN_BULK_PURCHASE_ITEM_FIELD'],
    ['A12-B-083', 'referenceEventId 없음', { items: [{ itemId: ITEM }] }, null],
    ['A12-B-084', 'referenceEventId 빈 글자', { referenceEventId: '', items: [{ itemId: ITEM }] }, null],
    ['A12-B-085', 'items 빈 배열', { referenceEventId: 'r-085', items: [] }, null],
    ['A12-B-086', 'items가 배열 아님', { referenceEventId: 'r-086', items: { itemId: ITEM } }, null],
    ['A12-B-087', 'itemId 숫자', { referenceEventId: 'r-087', items: [{ itemId: 7 }] }, null],
    ['A12-B-088', '같은 아이템 두 번', { referenceEventId: 'r-088', items: [{ itemId: ITEM }, { itemId: ITEM }] }, 'DUPLICATE_PURCHASE_ITEM'],
];
for (const [id, label, body, code] of BULK_BODIES) {
    test(`${id} 묶음 구매 ${label} → 400${code ? ` ${code}` : ''}, 지갑·장부 그대로`, async (t) => {
        const ctx = await setup(t);
        await assertRejectedUnchanged(ctx, '/economy/purchases/bulk', body, code);
    });
}

// ── A12-B-089~090: 참조 번호 길이 ──

test('A12-B-089 참조 번호 120자 → 통과 (201, 골드 빠짐)', async (t) => {
    const ctx = await setup(t);
    const res = await w.call(ctx.base, 'POST', '/economy/purchases/bulk', {
        cookie: ctx.cookie, body: { referenceEventId: 'r'.repeat(120), items: [{ itemId: ITEM }] },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(ctx.db._inspect.wallets.get(ctx.me).balance_gold, 800);
});

test('A12-B-090 참조 번호 121자 → 400, 지갑·장부 그대로', async (t) => {
    const ctx = await setup(t);
    await assertRejectedUnchanged(ctx, '/economy/purchases/bulk', { referenceEventId: 'r'.repeat(121), items: [{ itemId: ITEM }] }, null);
});

// ── A12-B-091: 몸으로 남의 계정을 못 고름 ──

test('A12-B-091 몸에 userId(남 uuid) 넣어 구매 → 400 모르는 칸, 남의 지갑 그대로', async (t) => {
    const ctx = await setup(t);
    const other = w.uid('a12-other');
    w.seedWallet(ctx.db, other, { gold: 1_000 });
    const res = await assertRejectedUnchanged(ctx, '/economy/purchases/bulk', {
        userId: other, referenceEventId: 'r-091', items: [{ itemId: ITEM }],
    }, 'UNKNOWN_BULK_PURCHASE_FIELD');
    assert.equal(res.status, 400);
    assert.equal(ctx.db._inspect.wallets.get(other).balance_gold, 1_000);
    assert.equal(ctx.db._inspect.entitlements.filter((row) => row.user_id === other).length, 0);
});

// ── A12-B-092: 단건 구매 몸 검사 ──

test('A12-B-092 단건 구매 모르는 칸 → 400 UNKNOWN_PURCHASE_FIELD, 지갑·장부 그대로', async (t) => {
    const ctx = await setup(t);
    await assertRejectedUnchanged(ctx, '/economy/purchase', { itemId: ITEM, referenceEventId: 'r-092', priceGold: 1 }, 'UNKNOWN_PURCHASE_FIELD');
});

// ── A12-B-093: 새로 사면 201, 같은 번호 다시면 200 ──

test('A12-B-093 첫 구매 → 201 idempotent:false, 같은 몸 다시 → 200 idempotent:true, 골드 한 번만 빠짐', async (t) => {
    const ctx = await setup(t);
    const body = { itemId: ITEM2, referenceEventId: 'r-093' };
    const first = await w.call(ctx.base, 'POST', '/economy/purchase', { cookie: ctx.cookie, body });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.idempotent, false);
    const again = await w.call(ctx.base, 'POST', '/economy/purchase', { cookie: ctx.cookie, body });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.idempotent, true);
    assert.equal(ctx.db._inspect.wallets.get(ctx.me).balance_gold, 700);
});
