'use strict';

// F-08 economy.service.js 단위 시험. 실제 MySQL 없이도 AC-01(동시 구매 무결성)·
// AC-02(재처리 방지 키)·AC-03(기본 지급)·AC-04(서버 가격 신뢰)·AC-05(소유권·종류 검증)를
// 검증하기 위해, Sequelize 모델과 같은 호출 계약({find,create,update,lock} 등)만 흉내
// 내는 인메모리 fake db를 주입한다(backend/service/concurrency.service.js가 이미 쓰는
// model 주입 패턴과 같다). 지갑 행 잠금(SELECT ... FOR UPDATE)은 사용자별 순서 큐로
// 흉내 내, 서비스가 실제로 "잠금 → 소유 여부 확인" 순서를 지키는지까지 검증한다 — 순서가
// 반대라면(소유 여부를 먼저 확인) 이 fake에서도 AC-01 시험이 실패한다.
//
// 실제 MySQL 유일 제약·행 잠금 자체를 검증하는 통합 시험은
// backend/tests/db/f08-economy.integration.test.js에 있다(F01_TEST_DATABASE_URL이
// 없으면 미검증으로 skip — f01~f07과 같은 관례).

const test = require('node:test');
const assert = require('node:assert/strict');

const economyService = require('./economy.service');
const { DEFAULT_PROFILE_PHOTO_ID, DEFAULT_PROFILE_BORDER_ID } = require('../economy/catalog');

const createFakeDb = () => {
    const walletsByUser = new Map();
    const loadoutsByUser = new Map();
    const entitlements = [];
    const ledgerEntries = [];
    let nextEntitlementId = 1;
    let nextLedgerId = 1;
    const mutexTails = new Map();

    // 같은 user_id에 대한 lock 획득 요청을 FIFO로 순서를 매겨, 실제 행 잠금처럼 한 번에
    // 하나의 트랜잭션만 그 사용자의 지갑을 쥐게 한다.
    const acquireUserLock = (userId) => {
        const tail = mutexTails.get(userId) ?? Promise.resolve();
        let release;
        const held = new Promise((resolve) => { release = resolve; });
        mutexTails.set(userId, tail.then(() => held));
        return tail.then(() => release);
    };

    const EconomyWallet = {
        async create({ user_id, balance_gold }) {
            if (walletsByUser.has(user_id)) {
                const error = new Error('duplicate wallet');
                error.name = 'SequelizeUniqueConstraintError';
                throw error;
            }
            const record = {
                user_id,
                balance_gold,
                async update(patch, options = {}) {
                    if (options.transaction) {
                        const before = { ...record };
                        options.transaction._undo.push(() => Object.assign(record, before));
                    }
                    Object.assign(record, patch);
                },
            };
            walletsByUser.set(user_id, record);
            return record;
        },
        async findOne({ where, transaction, lock }) {
            const record = walletsByUser.get(where.user_id);
            if (!record) return null;
            if (lock && transaction) {
                const release = await acquireUserLock(where.user_id);
                transaction._releasers.push(release);
            }
            return record;
        },
    };

    const EconomyEntitlement = {
        async create({ user_id, item_id, item_type, source }) {
            const record = { id: nextEntitlementId++, user_id, item_id, item_type, source, acquired_at: new Date() };
            entitlements.push(record);
            return record;
        },
        async findOne({ where }) {
            return entitlements.find((e) => e.user_id === where.user_id && e.item_id === where.item_id) ?? null;
        },
        async findAll({ where }) {
            return entitlements.filter((e) => e.user_id === where.user_id);
        },
    };

    const EconomyLoadout = {
        async findOrCreate({ where, defaults }) {
            let record = loadoutsByUser.get(where.user_id);
            if (record) return [record, false];
            record = {
                user_id: where.user_id,
                selected_profile_photo_id: null,
                selected_profile_border_id: null,
                selected_card_frame_id: null,
                ...defaults,
                async update(patch) { Object.assign(record, patch); },
            };
            loadoutsByUser.set(where.user_id, record);
            return [record, true];
        },
        async findOne({ where }) {
            return loadoutsByUser.get(where.user_id) ?? null;
        },
    };

    const EconomyLedgerEntry = {
        async create({ user_id, reason, item_id, amount, balance_after, reference_event_id }) {
            if (ledgerEntries.some((e) => e.reference_event_id === reference_event_id)) {
                const error = new Error('duplicate reference_event_id');
                error.name = 'SequelizeUniqueConstraintError';
                throw error;
            }
            const record = { id: nextLedgerId++, user_id, reason, item_id, amount, balance_after, reference_event_id, created_at: new Date() };
            ledgerEntries.push(record);
            return record;
        },
        async findOne({ where }) {
            if (!where.reference_event_id) return null;
            return ledgerEntries.find((e) => e.reference_event_id === where.reference_event_id) ?? null;
        },
        async findAll({ where, limit }) {
            const rows = ledgerEntries.filter((e) => e.user_id === where.user_id).slice().reverse();
            return typeof limit === 'number' ? rows.slice(0, limit) : rows;
        },
    };

    const sequelize = {
        models: { EconomyWallet, EconomyEntitlement, EconomyLoadout },
        transaction: async (fn) => {
            const t = { LOCK: { UPDATE: 'UPDATE' }, _releasers: [], _undo: [] };
            try {
                return await fn(t);
            } catch (error) {
                for (const undo of t._undo.slice().reverse()) undo();
                throw error;
            } finally {
                for (const release of t._releasers) release();
            }
        },
    };

    return {
        sequelize,
        EconomyLedgerEntry,
        _inspect: { walletsByUser, ledgerEntries, entitlements },
    };
};

const PURCHASABLE_ITEM_ID = 'profile-border-남작'; // priceGold 200
const PURCHASABLE_ITEM_PRICE = 200;

const grantBalance = async (db, userId, amountGold) => {
    await economyService.grantReward({ userId, amountGold, reason: 'TEST_SEED', referenceEventId: `seed:${userId}:${amountGold}:${Math.random()}` }, db);
};

// ── AC-01: 동시 구매 무결성 ──────────────────────────────────────────────────

test('AC-01: 같은 계정으로 동일 상품을 동시에 두 번 구매 요청해도 한 번만 차감된다', async () => {
    const db = createFakeDb();
    const userId = 'user-ac01';
    await grantBalance(db, userId, 1000);

    const results = await Promise.allSettled([
        economyService.purchaseItem({ userId, itemId: PURCHASABLE_ITEM_ID, referenceEventId: `req-a-${userId}` }, db),
        economyService.purchaseItem({ userId, itemId: PURCHASABLE_ITEM_ID, referenceEventId: `req-b-${userId}` }, db),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1, '정확히 한 요청만 성공해야 한다');
    assert.equal(rejected.length, 1, '나머지 한 요청은 거부돼야 한다');
    assert.equal(rejected[0].reason.code, 'ITEM_ALREADY_OWNED');

    const wallet = db._inspect.walletsByUser.get(userId);
    assert.equal(wallet.balance_gold, 1000 - PURCHASABLE_ITEM_PRICE, '가격이 두 번 차감되면 안 된다');

    const ledgerSum = db._inspect.ledgerEntries
        .filter((e) => e.user_id === userId)
        .reduce((sum, e) => sum + e.amount, 0);
    assert.equal(ledgerSum, wallet.balance_gold, '지갑 잔액과 거래 원장 합계가 일치해야 한다');

    const ownedCount = db._inspect.entitlements.filter((e) => e.user_id === userId && e.item_id === PURCHASABLE_ITEM_ID).length;
    assert.equal(ownedCount, 1, '소유권이 중복 부여되면 안 된다');
});

// ── AC-02: 재처리 방지 키 ────────────────────────────────────────────────────

test('AC-02: 같은 참조 사건 ID로 구매를 재전송해도 중복 지급되지 않는다', async () => {
    const db = createFakeDb();
    const userId = 'user-ac02';
    await grantBalance(db, userId, 1000);
    const referenceEventId = `retry-${userId}`;

    const first = await economyService.purchaseItem({ userId, itemId: PURCHASABLE_ITEM_ID, referenceEventId }, db);
    const second = await economyService.purchaseItem({ userId, itemId: PURCHASABLE_ITEM_ID, referenceEventId }, db);

    assert.equal(first.idempotent, false);
    assert.equal(second.idempotent, true);
    assert.equal(second.ledgerEntry.id, first.ledgerEntry.id);

    const wallet = db._inspect.walletsByUser.get(userId);
    assert.equal(wallet.balance_gold, 1000 - PURCHASABLE_ITEM_PRICE);
    assert.equal(db._inspect.entitlements.filter((e) => e.user_id === userId).length, 1);
});

test('AC-02: 기본 지급을 두 번 호출해도 계정당 한 번만 지급된다', async () => {
    const db = createFakeDb();
    const userId = 'user-ac02-default';

    await economyService.ensureDefaultEntitlements(userId, db);
    await economyService.ensureDefaultEntitlements(userId, db);

    const grantedForUser = db._inspect.entitlements.filter((e) => e.user_id === userId);
    assert.equal(grantedForUser.length, 17, '중복 없이 17종(프로필 16 + 테두리 1)만 보유해야 한다');
});

// ── AC-03: 기본 프로필/테두리 지급 + 기본 선택값 ────────────────────────────

test('AC-03: 신규/기존 계정 모두 기본 프로필 16종 + 평민 테두리 1종을 보유하고 기본 선택은 금빛가면이다', async () => {
    const db = createFakeDb();
    const userId = 'user-ac03';

    const summary = await economyService.getWalletSummary(userId, db);

    assert.equal(summary.entitlements.length, 17);
    const photoCount = summary.entitlements.filter((e) => e.itemType === 'PROFILE_PHOTO').length;
    const borderCount = summary.entitlements.filter((e) => e.itemType === 'PROFILE_BORDER').length;
    assert.equal(photoCount, 16);
    assert.equal(borderCount, 1);

    const ids = new Set(summary.entitlements.map((e) => e.itemId));
    assert.equal(ids.size, 17, '중복 보유가 없어야 한다');

    assert.equal(summary.loadout.selectedProfilePhotoId, DEFAULT_PROFILE_PHOTO_ID);
    assert.equal(summary.loadout.selectedProfileBorderId, DEFAULT_PROFILE_BORDER_ID);
});

test('A-04: 이미 유효한 선택값이 있는 계정은 기본 지급 시에도 선택값이 바뀌지 않는다', async () => {
    const db = createFakeDb();
    const userId = 'user-a04';

    await economyService.ensureDefaultEntitlements(userId, db);
    await economyService.equipItem({ userId, slot: 'PROFILE_PHOTO', itemId: 'player-profile-기사' }, db);

    await economyService.ensureDefaultEntitlements(userId, db);

    const loadout = db._inspect.walletsByUser; // sanity: wallet 존재 확인용 접근 아님
    const summary = await economyService.getWalletSummary(userId, db);
    assert.equal(summary.loadout.selectedProfilePhotoId, 'player-profile-기사', '기존 유효 선택을 덮어쓰면 안 된다');
});

// ── AC-04: 서버가 클라이언트 가격을 신뢰하지 않는다 ─────────────────────────

test('AC-04: 실제 잔액이 부족하면 구매가 거부된다(클라이언트가 주장하는 가격과 무관)', async () => {
    const db = createFakeDb();
    const userId = 'user-ac04';
    await grantBalance(db, userId, PURCHASABLE_ITEM_PRICE - 1);

    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: PURCHASABLE_ITEM_ID, referenceEventId: `req-${userId}` }, db),
        (error) => error.code === 'INSUFFICIENT_BALANCE',
    );

    const wallet = db._inspect.walletsByUser.get(userId);
    assert.equal(wallet.balance_gold, PURCHASABLE_ITEM_PRICE - 1, '실패한 구매는 잔액을 바꾸면 안 된다');
});

test('AC-04: 카탈로그에 없거나 구매 불가한 상품은 거부된다', async () => {
    const db = createFakeDb();
    const userId = 'user-ac04-catalog';
    await grantBalance(db, userId, 10000);

    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: DEFAULT_PROFILE_PHOTO_ID, referenceEventId: `req-a-${userId}` }, db),
        (error) => error.code === 'ITEM_NOT_PURCHASABLE',
    );
    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: '../../etc/passwd', referenceEventId: `req-b-${userId}` }, db),
        (error) => error.code === 'ITEM_NOT_PURCHASABLE',
    );
});

// ── AC-05: 소유권·아이템 종류 검증 ──────────────────────────────────────────

test('AC-05: 소유하지 않은 상품은 장착이 거부된다', async () => {
    const db = createFakeDb();
    const userId = 'user-ac05-unowned';

    await assert.rejects(
        () => economyService.equipItem({ userId, slot: 'PROFILE_BORDER', itemId: 'profile-border-황제' }, db),
        (error) => error.status === 403 && error.code === 'ITEM_NOT_OWNED',
    );
});

test('AC-05: 카탈로그에 없는 임의 문자열(파일 경로 등)은 장착이 거부된다', async () => {
    const db = createFakeDb();
    const userId = 'user-ac05-path';

    await assert.rejects(
        () => economyService.equipItem({ userId, slot: 'PROFILE_PHOTO', itemId: '../../../etc/passwd' }, db),
        (error) => error.status === 400 && error.code === 'ITEM_TYPE_MISMATCH',
    );
});

test('AC-05: 보유 중이어도 슬롯과 아이템 종류가 다르면 장착이 거부된다', async () => {
    const db = createFakeDb();
    const userId = 'user-ac05-typemismatch';
    await economyService.ensureDefaultEntitlements(userId, db); // 평민 테두리 보유

    await assert.rejects(
        () => economyService.equipItem({ userId, slot: 'PROFILE_PHOTO', itemId: DEFAULT_PROFILE_BORDER_ID }, db),
        (error) => error.status === 400 && error.code === 'ITEM_TYPE_MISMATCH',
    );
});

test('AC-05: 정당히 보유한 상품은 장착에 성공한다', async () => {
    const db = createFakeDb();
    const userId = 'user-ac05-owned';
    await grantBalance(db, userId, 1000);
    await economyService.purchaseItem({ userId, itemId: PURCHASABLE_ITEM_ID, referenceEventId: `buy-${userId}` }, db);

    const loadout = await economyService.equipItem({ userId, slot: 'PROFILE_BORDER', itemId: PURCHASABLE_ITEM_ID }, db);
    assert.equal(loadout.selected_profile_border_id, PURCHASABLE_ITEM_ID);
});
