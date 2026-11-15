'use strict';

// 아이템 구매 DB 시험: 골드 잔액 경계·파는 종류·묶음 다 되거나 다 안 됨·이미 가짐·판매 안 함·값 바뀜을 시험 DB 네 표(지갑·장부·가진 것·구매 요청)로 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-259~280 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
process.env.DATABASE_URL = process.env.F01_TEST_DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const h = require('./a12-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../../services/economy/catalog');

test.before(h.prepareDb);
test.after(h.closeDb);

// 남작 테두리 200골드 · 스킨 500골드 (catalog 값, 목록 줄 그대로)
const BORDER = 'profile-border-남작';
const SKIN = 'player-skin-광대1-불멸';

// ── A12-B-259~266 골드 잔액 경계 × 아이템 값 2종 [버그 2] ──
// 값 −1·0은 거절 + 네 표 그대로, 값·값+1은 사짐 + 남은 잔액
const BALANCE_CASES = [
    { no: 'A12-B-259', itemId: BORDER, price: 200, balance: 0, ok: false },
    { no: 'A12-B-260', itemId: BORDER, price: 200, balance: 199, ok: false },
    { no: 'A12-B-261', itemId: BORDER, price: 200, balance: 200, ok: true, left: 0 },
    { no: 'A12-B-262', itemId: BORDER, price: 200, balance: 201, ok: true, left: 1 },
    { no: 'A12-B-263', itemId: SKIN, price: 500, balance: 0, ok: false },
    { no: 'A12-B-264', itemId: SKIN, price: 500, balance: 499, ok: false },
    { no: 'A12-B-265', itemId: SKIN, price: 500, balance: 500, ok: true, left: 0 },
    { no: 'A12-B-266', itemId: SKIN, price: 500, balance: 501, ok: true, left: 1 },
];

for (const c of BALANCE_CASES) {
    test(`${c.no} ${c.price}골드 아이템, 잔액 ${c.balance} → ${c.ok ? `사짐·잔액 ${c.left}` : '400 잔액이 부족합니다·네 표 그대로'}`, async (t) => {
        if (h.noDb(t)) return;
        const base = await h.startServer(t);
        const user = await h.createUser('bal');
        // 잔액 0도 지갑 줄은 있는 계정 (지갑 줄 없음과 잔액 0을 섞지 않음)
        await h.ensureWallet(user);
        if (c.balance > 0) await h.fund(user, 'GOLD', c.balance);
        const before = await h.fourTables(user);

        const res = await h.buy(base, user, c.itemId);

        if (!c.ok) {
            h.assertCode(res, 400, 'INSUFFICIENT_BALANCE');
            assert.equal(res.body.message, '잔액이 부족합니다.');
            assert.deepEqual(await h.fourTables(user), before);
            return;
        }
        assert.equal(res.status, 201);
        assert.equal((await h.walletOf(user)).gold, c.left);
        assert.equal(res.body.ledgerEntry.balanceAfter, c.left);
    });
}

// ── A12-B-267~270 파는 종류마다 사짐 ──
// 장부 PURCHASE −값 1줄 + 가진 것 1줄(종류 맞음) + 구매 요청 SINGLE 1줄
const KIND_CASES = [
    { no: 'A12-B-267', label: '테두리', itemId: 'profile-border-자작', price: 300, type: 'PROFILE_BORDER' },
    { no: 'A12-B-268', label: '스킨', itemId: 'player-skin-귀족1-블러드', price: 500, type: 'SKIN' },
    { no: 'A12-B-269', label: '카드 테두리', itemId: 'player-card-가고일', price: 500, type: 'PLAYER_CARD_FRAME' },
    { no: 'A12-B-270', label: '상점 이모티콘', itemId: 'emoji-shush', price: 500, type: 'EMOTICON' },
];

for (const c of KIND_CASES) {
    test(`${c.no} ${c.label} 사기 → 장부 PURCHASE −${c.price} 1줄·가진 것 ${c.type} 1줄·구매 요청 SINGLE 1줄`, async (t) => {
        if (h.noDb(t)) return;
        const base = await h.startServer(t);
        const user = await h.createUser('kind');
        await h.fund(user, 'GOLD', 1000);

        const res = await h.buy(base, user, c.itemId);
        assert.equal(res.status, 201, JSON.stringify(res.body));

        const purchases = (await h.ledgerOf(user)).filter((row) => row.reason === 'PURCHASE');
        assert.equal(purchases.length, 1);
        assert.equal(Number(purchases[0].amount), -c.price);
        assert.equal(purchases[0].item_id, c.itemId);
        const owned = (await h.entitlementsOf(user)).filter((row) => row.item_id === c.itemId);
        assert.equal(owned.length, 1);
        assert.equal(owned[0].item_type, c.type);
        const requests = await h.requestsOf(user);
        assert.deepEqual(requests.map((row) => row.kind), ['SINGLE']);
        assert.equal((await h.walletOf(user)).gold, 1000 - c.price);
    });
}

// ── A12-B-271~274 묶음은 다 되거나 다 안 됨 ──

test('A12-B-271 묶음 합 = 잔액 → 둘 다 사짐·구매 요청 BULK 1줄·잔액 0', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('bulk');
    await h.fund(user, 'GOLD', 700); // 남작 200 + 후작 500

    const res = await h.buyBulk(base, user, ['profile-border-남작', 'profile-border-후작']);
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const owned = (await h.entitlementsOf(user)).map((row) => row.item_id).sort();
    assert.deepEqual(owned, ['profile-border-남작', 'profile-border-후작'].sort());
    assert.deepEqual((await h.requestsOf(user)).map((row) => row.kind), ['BULK']);
    assert.equal((await h.walletOf(user)).gold, 0);
});

test('A12-B-272 묶음 합 = 잔액+1 → 하나도 안 사짐(하나만 사지 않음)·네 표 그대로', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('bulk');
    await h.fund(user, 'GOLD', 699); // 합 700에 1 모자람, 첫 아이템 200은 살 수 있는 돈
    const before = await h.fourTables(user);

    const res = await h.buyBulk(base, user, ['profile-border-남작', 'profile-border-후작']);
    h.assertCode(res, 400, 'INSUFFICIENT_BALANCE');
    assert.deepEqual(await h.fourTables(user), before);
});

test('A12-B-273 묶음 중 하나 이미 가짐 → 전부 거절·네 표 그대로', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('bulk');
    await h.fund(user, 'GOLD', 2000);
    assert.equal((await h.buy(base, user, 'profile-border-후작')).status, 201);
    const before = await h.fourTables(user);

    const res = await h.buyBulk(base, user, ['profile-border-남작', 'profile-border-후작']);
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.code, 'ITEM_ALREADY_OWNED');
    assert.deepEqual(await h.fourTables(user), before);
});

test('A12-B-274 묶음 중 하나 판매 안 함 → 전부 거절·네 표 그대로', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('bulk');
    await h.fund(user, 'GOLD', 2000);
    const before = await h.fourTables(user);

    // 업적 직업 테두리는 안 팖
    const res = await h.buyBulk(base, user, ['profile-border-남작', 'profile-border-광대']);
    h.assertCode(res, 400, 'ITEM_NOT_PURCHASABLE');
    assert.deepEqual(await h.fourTables(user), before);
});

// ── A12-B-275 이미 가진 것 ──

test('A12-B-275 가진 테두리를 다른 번호로 다시 사기 → 409 이미 보유한 상품입니다·골드 그대로', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('own');
    await h.fund(user, 'GOLD', 1000);
    assert.equal((await h.buy(base, user, BORDER, 'a12d-own-1')).status, 201);
    const goldAfterFirst = (await h.walletOf(user)).gold;

    const res = await h.buy(base, user, BORDER, 'a12d-own-2');
    h.assertCode(res, 409, 'ITEM_ALREADY_OWNED');
    assert.equal(res.body.message, '이미 보유한 상품입니다.');
    assert.equal((await h.walletOf(user)).gold, goldAfterFirst);
});

// ── A12-B-276~279 판매 안 하는 아이템 ──
// 400 ITEM_NOT_PURCHASABLE, 글에 상품 id·영어 없음, 네 표 그대로
const NOT_FOR_SALE = [
    { no: 'A12-B-276', label: '기본 지급 사진', itemId: 'player-profile-기사' },
    { no: 'A12-B-277', label: '업적 직업 테두리', itemId: 'profile-border-귀족' },
    { no: 'A12-B-278', label: '기본 이모티콘', itemId: 'emoji-basic-love' },
    { no: 'A12-B-279', label: '없는 id', itemId: 'no-such-item-a12d' },
];

for (const c of NOT_FOR_SALE) {
    test(`${c.no} ${c.label} 사기 → 400 ITEM_NOT_PURCHASABLE·글에 상품 id 영어 없음·네 표 그대로`, async (t) => {
        if (h.noDb(t)) return;
        const base = await h.startServer(t);
        const user = await h.createUser('nfs');
        await h.fund(user, 'GOLD', 1000);
        const before = await h.fourTables(user);

        const res = await h.buy(base, user, c.itemId);
        h.assertCode(res, 400, 'ITEM_NOT_PURCHASABLE');
        assert.equal(typeof res.body.message, 'string');
        assert.ok(!res.body.message.includes(c.itemId), `글에 상품 id 섞임: ${res.body.message}`);
        assert.doesNotMatch(res.body.message, /[A-Za-z]/, `글에 영어 섞임: ${res.body.message}`);
        assert.deepEqual(await h.fourTables(user), before);
    });
}

// ── A12-B-280 아이템 값이 바뀐 사이 [지금 동작] ──

test('A12-B-280 화면이 옛 값(200)을 본 채로 삼, 그사이 값이 250으로 바뀜 → 지금 서버 값 250으로 빠짐', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('price');
    await h.fund(user, 'GOLD', 1000);

    // 운영 중 값이 바뀐 것 흉내 (서버 상품 목록 값만 바꿈, 시험 끝나면 되돌림)
    const item = catalog.getCatalogItem(BORDER);
    const oldPrice = item.priceGold;
    item.priceGold = 250;
    t.after(() => { item.priceGold = oldPrice; });

    // 몸에는 값 칸이 없음 (아이템 id·참조 번호만)
    const res = await h.buy(base, user, BORDER);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.ledgerEntry.amount, -250);
    assert.equal((await h.walletOf(user)).gold, 750);
});
