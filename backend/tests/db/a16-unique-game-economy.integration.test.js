'use strict';

// 판 기록·통계·업적·지갑·장부·구매·상품·충전 표의 "겹치면 안 되는 것"이 DB에서 막히는지, 일부러 겹쳐도 되는 것은 들어가는지 봄 (SQL로 직접 넣음)
// 목록 docs/게임_의도_2026-11-15/시험목록/A16-DB-마이그레이션.md A16-B-213~225·242·245 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const h = require('./a16-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, noDb } = h;

test.before(async () => {
    if (h.TEST_DB_URL) await h.restoreFull();
});

test.after(async () => {
    if (h.TEST_DB_URL) await h.restoreFull();
    await db.sequelize.close();
});

const now = () => new Date();
const gameRow = (id) => ({ id, started_at: now(), ended_at: now(), winner: 'CITIZEN', day_index: 1, player_count: 5 });
const ledgerRow = (userId, referenceEventId) => ({
    user_id: userId, reason: 'TOPUP', currency: 'DIAMOND', amount: 10, balance_after: 10, reference_event_id: referenceEventId, created_at: now(),
});
const productRow = (productId) => ({
    product_id: productId, kind: 'DIAMOND', display_name: '다이아 10', pay_currency: 'KRW', pay_amount: 1000,
    grant_currency: 'DIAMOND', grant_amount: 10, status: 'ACTIVE', created_at: now(), updated_at: now(),
});
const orderRow = (userId, paymentKey) => ({
    order_id: `ord-${crypto.randomUUID()}`, user_id: userId, product_id: 'a16-product', version: 1, pay_amount: 1000,
    grant_amount: 10, order_name: '다이아 10', payment_key: paymentKey, created_at: now(), updated_at: now(),
});

test('A16-B-213 같은 판 기록 두 번 안 됨 (같은 id → 기본 키 겹침, 줄 1개)', async (t) => {
    if (noDb(t)) return;
    const gameId = crypto.randomUUID();
    await h.insert('game_results', gameRow(gameId));
    await h.expectDuplicate(h.insert('game_results', gameRow(gameId)), 'PRIMARY');
    assert.equal(await h.count('game_results', 'id = :gameId', { gameId }), 1);
});

test('A16-B-214 한 판에 같은 사람 결과 한 줄 (기본 키 겹침)', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('ge');
    const gameId = crypto.randomUUID();
    await h.insert('game_results', gameRow(gameId));
    const row = { game_id: gameId, user_id: userId, nickname_snapshot: '민수', role: 'CITIZEN', team: 'CITIZEN', is_alive: true };
    await h.insert('game_result_players', row);
    await h.expectDuplicate(h.insert('game_result_players', row), 'PRIMARY');
    assert.equal(await h.count('game_result_players', 'game_id = :gameId', { gameId }), 1);
});

test('A16-B-215 같은 판·같은 날·같은 사람 투표 참여는 한 번 (날만 다르면 들어감)', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('ge');
    const gameId = crypto.randomUUID();
    const row = (dayIndex) => ({ game_id: gameId, day_index: dayIndex, user_id: userId, accepted_at: now() });
    await h.insert('vote_participations', row(1));
    await h.expectDuplicate(h.insert('vote_participations', row(1)), 'vote_participations_game_day_user_unique');
    await h.insert('vote_participations', row(2));
    assert.equal(await h.count('vote_participations', 'game_id = :gameId', { gameId }), 2);
});

test('A16-B-216 한 사람에 통계 한 줄 (기본 키 겹침)', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('ge');
    await h.insert('user_stats', { user_id: userId });
    await h.expectDuplicate(h.insert('user_stats', { user_id: userId }), 'PRIMARY');
    assert.equal(await h.count('user_stats', 'user_id = :userId', { userId }), 1);
});

test('A16-B-217 같은 업적은 한 번만 받음', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('ge');
    const row = { user_id: userId, achievement_id: 'FIRST_WIN', granted_at: now() };
    await h.insert('achievement_grants', row);
    await h.expectDuplicate(h.insert('achievement_grants', row), 'achievement_grants_user_achievement_unique');
    assert.equal(await h.count('achievement_grants', 'user_id = :userId', { userId }), 1);
});

test('A16-B-218 한 사람에 지갑 하나 (기본 키 겹침)', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('ge');
    const row = { user_id: userId, created_at: now(), updated_at: now() };
    await h.insert('economy_wallets', row);
    await h.expectDuplicate(h.insert('economy_wallets', row), 'PRIMARY');
    assert.equal(await h.count('economy_wallets', 'user_id = :userId', { userId }), 1);
});

test('A16-B-219 같은 요청 번호로 장부 두 줄 안 됨 (topup:<주문 id>)', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('ge');
    const ref = `topup:ord-${crypto.randomUUID()}`;
    await h.insert('economy_ledger_entries', ledgerRow(userId, ref));
    await h.expectDuplicate(h.insert('economy_ledger_entries', ledgerRow(userId, ref)), 'economy_ledger_entries_user_reference_unique');
    assert.equal(await h.count('economy_ledger_entries', 'user_id = :userId', { userId }), 1);
});

test('A16-B-220 같은 구매 요청 번호는 한 번', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('ge');
    const row = { user_id: userId, reference_event_id: `buy-${crypto.randomUUID()}`, kind: 'ITEM', payload_json: '{}', result_json: '{}', created_at: now() };
    await h.insert('economy_purchase_requests', row);
    await h.expectDuplicate(h.insert('economy_purchase_requests', row), 'economy_purchase_requests_user_reference_unique');
    assert.equal(await h.count('economy_purchase_requests', 'user_id = :userId', { userId }), 1);
});

test('A16-B-221 같은 아이템 두 번 가지기 안 됨', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('ge');
    const row = { user_id: userId, item_id: 'skin.clown.a16', item_type: 'SKIN', source: 'PURCHASE', acquired_at: now() };
    await h.insert('economy_entitlements', row);
    await h.expectDuplicate(h.insert('economy_entitlements', row), 'economy_entitlements_user_item_unique');
    assert.equal(await h.count('economy_entitlements', 'user_id = :userId', { userId }), 1);
});

test('A16-B-222 장착 줄은 한 사람 하나 (기본 키 겹침)', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('ge');
    const row = () => ({ user_id: userId, created_at: now(), updated_at: now(), revision: crypto.randomUUID() });
    await h.insert('economy_loadouts', row());
    await h.expectDuplicate(h.insert('economy_loadouts', row()), 'PRIMARY');
    assert.equal(await h.count('economy_loadouts', 'user_id = :userId', { userId }), 1);
});

test('A16-B-223 이모티콘 8칸 줄은 한 사람 하나 (기본 키 겹침)', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('ge');
    const row = () => ({ user_id: userId, revision: crypto.randomUUID(), created_at: now(), updated_at: now() });
    await h.insert('economy_emoji_palettes', row());
    await h.expectDuplicate(h.insert('economy_emoji_palettes', row()), 'PRIMARY');
    assert.equal(await h.count('economy_emoji_palettes', 'user_id = :userId', { userId }), 1);
});

test('A16-B-224 상품 id는 하나 (기본 키 겹침)', async (t) => {
    if (noDb(t)) return;
    const productId = `a16-${crypto.randomUUID().slice(0, 8)}`;
    await h.insert('economy_currency_products', productRow(productId));
    await h.expectDuplicate(h.insert('economy_currency_products', productRow(productId)), 'PRIMARY');
    assert.equal(await h.count('economy_currency_products', 'product_id = :productId', { productId }), 1);
});

test('A16-B-225 같은 결제 번호로 두 주문 안 됨', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('ge');
    const paymentKey = `pay-${crypto.randomUUID()}`;
    await h.insert('economy_topup_orders', orderRow(userId, paymentKey));
    await h.expectDuplicate(h.insert('economy_topup_orders', orderRow(userId, paymentKey)), 'economy_topup_orders_payment_key_unique');
    assert.equal(await h.count('economy_topup_orders', 'payment_key = :paymentKey', { paymentKey }), 1);
});

test('A16-B-242 결제 번호가 빈 주문(CREATED)은 여러 줄 됨', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('ge');
    for (let i = 0; i < 3; i += 1) await h.insert('economy_topup_orders', orderRow(userId, null));
    assert.equal(await h.count('economy_topup_orders', "user_id = :userId AND payment_key IS NULL AND status = 'CREATED'", { userId }), 3);
});

test('A16-B-245 장부 요청 번호는 사람마다 따로 (민수·지유 같은 번호 둘 다 들어감)', async (t) => {
    if (noDb(t)) return;
    const minsu = await h.createUser('민수');
    const jiyu = await h.createUser('지유');
    const ref = `topup:ord-${crypto.randomUUID()}`;
    await h.insert('economy_ledger_entries', ledgerRow(minsu, ref));
    await h.insert('economy_ledger_entries', ledgerRow(jiyu, ref));
    assert.equal(await h.count('economy_ledger_entries', 'reference_event_id = :ref', { ref }), 2);
});
