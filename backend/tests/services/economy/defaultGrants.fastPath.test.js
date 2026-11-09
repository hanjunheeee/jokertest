'use strict';

// 기본 지급 빠른 길 시험 (2026-11-09 부하 시험: 방 만들기·입장·시작이 느렸던 까닭)
// 이미 받은 계정은 묻기 몇 번으로 끝, 장부 거래·장착 쓰기 안 함 / 새 아이템·장부 내용 다름은 예전처럼
const test = require('node:test');
const assert = require('node:assert/strict');

const economy = require('../../../services/economy');
const catalog = require('../../../services/economy/catalog');
const { createFakeEconomyDb } = require('../../audit-2026-11-09/fakeEconomyDb');

// 가짜 DB 모델 호출 세기 (모델 이름.함수 이름 → 횟수)
const countCalls = (db) => {
    const counts = new Map();
    const wrap = (name, model) => {
        for (const key of ['findOne', 'findAll', 'create', 'update', 'findOrCreate']) {
            if (typeof model?.[key] !== 'function') continue;
            const original = model[key].bind(model);
            model[key] = (...args) => {
                counts.set(`${name}.${key}`, (counts.get(`${name}.${key}`) ?? 0) + 1);
                return original(...args);
            };
        }
    };
    wrap('ledger', db.EconomyLedgerEntry);
    for (const [name, model] of Object.entries(db.sequelize.models)) wrap(name, model);
    const originalTransaction = db.sequelize.transaction.bind(db.sequelize);
    db.sequelize.transaction = (...args) => {
        counts.set('transaction', (counts.get('transaction') ?? 0) + 1);
        return originalTransaction(...args);
    };
    const total = () => [...counts.values()].reduce((sum, n) => sum + n, 0);
    return { counts, total, reset: () => counts.clear() };
};

test('기본 지급: 이미 다 받은 계정은 거래 0번·쓰기 0번, 묻기 3번(장부·보유·장착)으로 끝', async () => {
    const db = createFakeEconomyDb();
    const userId = 'user-fast';
    await economy.ensureDefaultEntitlements(userId, db);
    const owned = db._inspect.entitlements.filter((e) => e.user_id === userId).length;
    assert.equal(owned, catalog.listDefaultGrantItems().length);

    const calls = countCalls(db);
    const loadout = await economy.ensureDefaultEntitlements(userId, db);
    assert.equal(calls.counts.get('transaction') ?? 0, 0, '장부 거래 안 함');
    assert.equal(calls.total(), 3, `묻기 3번만 (실제 ${JSON.stringify(Object.fromEntries(calls.counts))})`);
    assert.equal(loadout.selected_profile_photo_id, catalog.DEFAULT_PROFILE_PHOTO_ID);
    assert.equal(db._inspect.entitlements.filter((e) => e.user_id === userId).length, owned, '두 번 안 줌');
});

test('기본 지급: 시작 장착 5명 처음엔 사람마다 묻기 3번(확인 때 읽은 장착 행 그대로 씀), 이 서버가 본 뒤엔 장착 목록 1번', async () => {
    const db = createFakeEconomyDb();
    const users = ['a', 'b', 'c', 'd', 'e'];
    await Promise.all(users.map((u) => economy.ensureDefaultEntitlements(u, db)));
    const calls = countCalls(db);
    const loadouts = await economy.getGameStartLoadouts(users, db);
    assert.deepEqual(Object.keys(loadouts).sort(), users);
    assert.equal(calls.counts.get('transaction') ?? 0, 0);
    assert.equal(calls.total(), users.length * 3);

    // 같은 서버가 다시 물으면 기본 지급 확인 건너뜀 (입장·시작마다 3질의 아끼기, 2026-11-09)
    calls.reset();
    assert.deepEqual(await economy.getGameStartLoadouts(users, db), loadouts);
    assert.equal(calls.total(), 1);
});

test('기본 지급: 하나만 빠진 계정은 그 하나만 장부 거래로 줌', async () => {
    const db = createFakeEconomyDb();
    const userId = 'user-missing-one';
    await economy.ensureDefaultEntitlements(userId, db);
    const [first] = catalog.listDefaultGrantItems();
    // 그 아이템 장부·보유 둘 다 없앰 (새 기본 아이템이 생긴 것과 같음)
    const { ledgerEntries, entitlements } = db._inspect;
    ledgerEntries.splice(ledgerEntries.findIndex((e) => e.user_id === userId && e.item_id === first.id), 1);
    entitlements.splice(entitlements.findIndex((e) => e.user_id === userId && e.item_id === first.id), 1);

    const calls = countCalls(db);
    await economy.ensureDefaultEntitlements(userId, db);
    assert.equal(calls.counts.get('transaction'), 1, '빠진 하나만 거래');
    assert.ok(entitlements.some((e) => e.user_id === userId && e.item_id === first.id), '다시 가짐');
});

test('기본 지급: 같은 참조 id인데 장부 내용이 다르면 예전처럼 409 REFERENCE_EVENT_CONFLICT', async () => {
    const db = createFakeEconomyDb();
    const userId = 'user-conflict';
    await economy.ensureDefaultEntitlements(userId, db);
    const [first] = catalog.listDefaultGrantItems();
    const entry = db._inspect.ledgerEntries.find((e) => e.user_id === userId && e.item_id === first.id);
    entry.amount = 5;
    await assert.rejects(economy.ensureDefaultEntitlements(userId, db), (error) => error.code === 'REFERENCE_EVENT_CONFLICT');
});

test('기본 지급: 장부 없이 다른 길로 이미 가진 아이템은 거래 없이 건너뜀', async () => {
    const db = createFakeEconomyDb();
    const userId = 'user-owned-elsewhere';
    for (const item of catalog.listDefaultGrantItems()) {
        await db.sequelize.models.EconomyEntitlement.create({ user_id: userId, item_id: item.id, item_type: item.type, source: 'PURCHASE' });
    }
    const calls = countCalls(db);
    await economy.ensureDefaultEntitlements(userId, db);
    assert.equal(calls.counts.get('transaction') ?? 0, 0);
    assert.equal(db._inspect.ledgerEntries.filter((e) => e.user_id === userId).length, 0);
});
