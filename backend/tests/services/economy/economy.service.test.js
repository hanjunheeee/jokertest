'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const economyService = require('../../../services/economy');
const { DEFAULT_PROFILE_PHOTO_ID, DEFAULT_PROFILE_BORDER_ID } = require('../../../services/economy/catalog');
const { CURRENCIES } = economyService;

const createFakeDb = () => {
    const walletsByUser = new Map();
    const loadoutsByUser = new Map();
    const entitlements = [];
    const ledgerEntries = [];
    let nextEntitlementId = 1;
    let nextLedgerId = 1;
    const mutexTails = new Map();

    const lockHolders = new Map();
    const acquireUserLock = (userId, transaction) => {
        if (lockHolders.get(userId) === transaction) {
            return Promise.resolve(() => {});
        }
        const tail = mutexTails.get(userId) ?? Promise.resolve();
        let release;
        const held = new Promise((resolve) => { release = resolve; });
        mutexTails.set(userId, tail.then(() => held));
        return tail.then(() => {
            lockHolders.set(userId, transaction);
            return () => { lockHolders.delete(userId); release(); };
        });
    };

    const loadoutMutexTails = new Map();
    const loadoutLockHolders = new Map();
    const acquireLoadoutLock = (userId, transaction) => {
        if (loadoutLockHolders.get(userId) === transaction) {
            return Promise.resolve(() => {});
        }
        const tail = loadoutMutexTails.get(userId) ?? Promise.resolve();
        let release;
        const held = new Promise((resolve) => { release = resolve; });
        loadoutMutexTails.set(userId, tail.then(() => held));
        return tail.then(() => {
            loadoutLockHolders.set(userId, transaction);
            return () => { loadoutLockHolders.delete(userId); release(); };
        });
    };

    const EconomyWallet = {
        async create({ user_id, balance_gold, balance_diamond }) {
            if (walletsByUser.has(user_id)) {
                const error = new Error('duplicate wallet');
                error.name = 'SequelizeUniqueConstraintError';
                throw error;
            }
            const record = {
                user_id,
                balance_gold,
                balance_diamond,
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
                const release = await acquireUserLock(where.user_id, transaction);
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

    const snapshotLoadout = (stored) => {
        const snapshot = {
            ...stored,
            async update(patch) { Object.assign(stored, patch); Object.assign(snapshot, patch); },
        };
        return snapshot;
    };
    const EconomyLoadout = {
        async findOrCreate({ where, defaults }) {
            let stored = loadoutsByUser.get(where.user_id);
            if (stored) return [snapshotLoadout(stored), false];
            stored = {
                user_id: where.user_id,
                selected_profile_photo_id: null,
                selected_profile_border_id: null,
                selected_card_frame_id: null,
                ...defaults,
            };
            loadoutsByUser.set(where.user_id, stored);
            return [snapshotLoadout(stored), true];
        },
        async findOne({ where, transaction, lock }) {
            const stored = loadoutsByUser.get(where.user_id);
            if (!stored) return null;
            if (lock && transaction) {
                const release = await acquireLoadoutLock(where.user_id, transaction);
                transaction._releasers.push(release);
            }
            return snapshotLoadout(stored);
        },
        async findAll({ where }) {
            const userIds = Array.isArray(where.user_id) ? where.user_id : [where.user_id];
            return userIds
                .map((userId) => loadoutsByUser.get(userId))
                .filter(Boolean)
                .map(snapshotLoadout);
        },
        async update(patch, { where }) {
            const stored = loadoutsByUser.get(where.user_id);
            if (!stored) return [0];
            const matches = Object.entries(where).every(([key, expected]) => stored[key] === expected);
            if (!matches) return [0];
            Object.assign(stored, patch);
            return [1];
        },
    };

    let ledgerCreateInterceptor = null;
    const EconomyLedgerEntry = {
        async create(fields) {
            const { user_id, reason, item_id, currency, amount, balance_after, reference_event_id } = fields;
            if (ledgerCreateInterceptor) {
                const interceptor = ledgerCreateInterceptor;
                ledgerCreateInterceptor = null;
                await interceptor(fields);
            }
            if (ledgerEntries.some((e) => e.user_id === user_id && e.reference_event_id === reference_event_id)) {
                const error = new Error('duplicate reference_event_id for this account');
                error.name = 'SequelizeUniqueConstraintError';
                throw error;
            }
            const record = { id: nextLedgerId++, user_id, reason, item_id, currency, amount, balance_after, reference_event_id, created_at: new Date() };
            ledgerEntries.push(record);
            return record;
        },
        async findOne({ where }) {
            if (!where.reference_event_id) return null;
            return ledgerEntries.find((e) => e.user_id === where.user_id && e.reference_event_id === where.reference_event_id) ?? null;
        },
        async findAll({ where, limit }) {
            const rows = ledgerEntries.filter((e) => e.user_id === where.user_id).slice().reverse();
            return typeof limit === 'number' ? rows.slice(0, limit) : rows;
        },
    };

    const purchaseRequests = [];
    let nextPurchaseRequestId = 1;
    const EconomyPurchaseRequest = {
        async create({ user_id, reference_event_id, kind, payload_json, result_json }, options = {}) {
            if (purchaseRequests.some((r) => r.user_id === user_id && r.reference_event_id === reference_event_id)) {
                const error = new Error('duplicate purchase request reference_event_id for this account');
                error.name = 'SequelizeUniqueConstraintError';
                throw error;
            }
            const record = {
                id: nextPurchaseRequestId++, user_id, reference_event_id, kind, payload_json, result_json,
                created_at: new Date(),
            };
            if (options.transaction) {
                options.transaction._undo.push(() => {
                    const index = purchaseRequests.indexOf(record);
                    if (index !== -1) purchaseRequests.splice(index, 1);
                });
            }
            purchaseRequests.push(record);
            return record;
        },
        async findOne({ where }) {
            if (!where.reference_event_id) return null;
            return purchaseRequests.find((r) => r.user_id === where.user_id && r.reference_event_id === where.reference_event_id) ?? null;
        },
    };

    const sequelize = {
        models: { EconomyWallet, EconomyEntitlement, EconomyLoadout, EconomyPurchaseRequest },
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
        _inspect: { walletsByUser, ledgerEntries, entitlements, purchaseRequests },
        _interceptNextLedgerCreate: (fn) => { ledgerCreateInterceptor = fn; },
    };
};

const PURCHASABLE_ITEM_ID = 'profile-border-남작';
const PURCHASABLE_ITEM_PRICE = 200;
const OTHER_PURCHASABLE_ITEM_ID = 'profile-border-자작';

const grantBalance = async (db, userId, amount, currency = CURRENCIES.GOLD) => {
    await economyService.grantReward({ userId, amount, currency, reason: 'TEST_SEED', referenceEventId: `seed:${userId}:${amount}:${Math.random()}` }, db);
};

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

test('AC-01: 같은 계정으로 서로 다른 참조 사건 ID의 서로 다른 지급 요청은 둘 다 독립적으로 성공한다', async () => {
    const db = createFakeDb();
    const userId = 'user-ac01-different-keys';

    const results = await Promise.allSettled([
        economyService.grantReward({ userId, amount: 100, referenceEventId: `key-a-${userId}` }, db),
        economyService.grantReward({ userId, amount: 250, referenceEventId: `key-b-${userId}` }, db),
    ]);

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2, '서로 다른 키의 지급은 서로 간섭하지 않고 둘 다 성공해야 한다');
    const wallet = db._inspect.walletsByUser.get(userId);
    assert.equal(wallet.balance_gold, 350);
});

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
    assert.equal(grantedForUser.length, 25, '중복 없이 25종(프로필 16 + 테두리 1 + 기본 이모티콘 8)만 보유해야 한다');
});

test('AC-02(R-IMPL): 같은 계정이 같은 참조 사건 ID를 다른 상품 구매에 재사용하면 이전 결과를 노출하지 않고 거부된다', async () => {
    const db = createFakeDb();
    const userId = 'user-ac02-mismatch';
    await grantBalance(db, userId, 1000);
    const referenceEventId = `shared-key-${userId}`;

    const first = await economyService.purchaseItem({ userId, itemId: PURCHASABLE_ITEM_ID, referenceEventId }, db);
    assert.equal(first.idempotent, false);

    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: OTHER_PURCHASABLE_ITEM_ID, referenceEventId }, db),
        (error) => error.status === 409 && error.code === 'REFERENCE_EVENT_CONFLICT'
            && error.ledgerEntry === undefined
            && !JSON.stringify(error).includes(PURCHASABLE_ITEM_ID),
    );

    assert.equal(db._inspect.entitlements.filter((e) => e.user_id === userId && e.item_id === OTHER_PURCHASABLE_ITEM_ID).length, 0);
});

test('AC-02/AC-06(R-IMPL): 같은 참조 사건 ID 문자열을 다른 계정이 제출해도 서로의 원장에 영향을 주지 않는다', async () => {
    const db = createFakeDb();
    const userA = 'user-ac06-a';
    const userB = 'user-ac06-b';
    const sharedReferenceEventId = 'shared-across-accounts';

    await grantBalance(db, userA, 500);
    await grantBalance(db, userB, 500);

    const resultA = await economyService.purchaseItem({ userId: userA, itemId: PURCHASABLE_ITEM_ID, referenceEventId: sharedReferenceEventId }, db);
    const resultB = await economyService.purchaseItem({ userId: userB, itemId: PURCHASABLE_ITEM_ID, referenceEventId: sharedReferenceEventId }, db);

    assert.equal(resultA.idempotent, false);
    assert.equal(resultB.idempotent, false, 'userB의 요청은 userA의 결과를 재사용한 것이 아니라 독립적으로 새로 처리되어야 한다');
    assert.notEqual(resultA.ledgerEntry.id, resultB.ledgerEntry.id);
    assert.equal(resultA.ledgerEntry.user_id, userA);
    assert.equal(resultB.ledgerEntry.user_id, userB);

    const walletA = db._inspect.walletsByUser.get(userA);
    const walletB = db._inspect.walletsByUser.get(userB);
    assert.equal(walletA.balance_gold, 500 - PURCHASABLE_ITEM_PRICE);
    assert.equal(walletB.balance_gold, 500 - PURCHASABLE_ITEM_PRICE);
});

test('AC-02(R-IMPL): 동시에 들어온 같은 참조 사건 ID 재시도는 하나만 실제로 처리되고 나머지는 같은 커밋 결과를 돌려받는다', async () => {
    const db = createFakeDb();
    const userId = 'user-ac02-concurrent-same-key';
    await grantBalance(db, userId, 1000);
    const referenceEventId = `concurrent-${userId}`;

    const results = await Promise.all([
        economyService.purchaseItem({ userId, itemId: PURCHASABLE_ITEM_ID, referenceEventId }, db),
        economyService.purchaseItem({ userId, itemId: PURCHASABLE_ITEM_ID, referenceEventId }, db),
        economyService.purchaseItem({ userId, itemId: PURCHASABLE_ITEM_ID, referenceEventId }, db),
    ]);

    const nonIdempotent = results.filter((r) => r.idempotent === false);
    const idempotent = results.filter((r) => r.idempotent === true);
    assert.equal(nonIdempotent.length, 1, '실제 처리는 정확히 한 번이어야 한다');
    assert.equal(idempotent.length, 2, '나머지는 재처리 없이 같은 커밋 결과를 돌려받아야 한다');
    for (const r of results) assert.equal(r.ledgerEntry.id, nonIdempotent[0].ledgerEntry.id);

    const wallet = db._inspect.walletsByUser.get(userId);
    assert.equal(wallet.balance_gold, 1000 - PURCHASABLE_ITEM_PRICE, '동시 재시도가 중복 차감을 일으키면 안 된다');
});

test('AC-02(R-IMPL): 지갑 갱신 뒤 원장 기록에서 실제 쓰기 실패가 나면 지갑 잔액이 롤백된다', async () => {
    const db = createFakeDb();
    const userId = 'user-ac02-rollback';
    await grantBalance(db, userId, 1000);
    const ledgerCountBeforeFailure = db._inspect.ledgerEntries.filter((e) => e.user_id === userId).length;

    db._interceptNextLedgerCreate(() => { throw new Error('시뮬레이션된 DB 쓰기 실패'); });

    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: PURCHASABLE_ITEM_ID, referenceEventId: `rollback-${userId}` }, db),
        /시뮬레이션된 DB 쓰기 실패/,
    );

    const wallet = db._inspect.walletsByUser.get(userId);
    assert.equal(wallet.balance_gold, 1000, '지갑 갱신 이후 실패한 트랜잭션은 잔액을 원래대로 되돌려야 한다');
    assert.equal(db._inspect.entitlements.filter((e) => e.user_id === userId).length, 0, '실패한 트랜잭션은 소유권도 부여하면 안 된다');
    assert.equal(
        db._inspect.ledgerEntries.filter((e) => e.user_id === userId).length,
        ledgerCountBeforeFailure,
        '실패한 원장 기록 자체는 남으면 안 된다(실패 전 시드 지급 원장만 남아 있어야 한다)',
    );
});

test('AC-03: 신규/기존 계정 모두 기본 프로필 16종 + 평민 테두리 1종을 보유하고 기본 선택은 금빛가면이다', async () => {
    const db = createFakeDb();
    const userId = 'user-ac03';

    const summary = await economyService.getWalletSummary(userId, db);

    assert.equal(summary.entitlements.length, 25);
    const photoCount = summary.entitlements.filter((e) => e.itemType === 'PROFILE_PHOTO').length;
    const borderCount = summary.entitlements.filter((e) => e.itemType === 'PROFILE_BORDER').length;
    const emoticonIds = summary.entitlements.filter((e) => e.itemType === 'EMOTICON').map((e) => e.itemId).sort();
    assert.equal(photoCount, 16);
    assert.equal(borderCount, 1);
    assert.deepEqual(emoticonIds, [
        'emoji-basic-anger', 'emoji-basic-dizzy', 'emoji-basic-grin', 'emoji-basic-hello',
        'emoji-basic-love', 'emoji-basic-reject', 'emoji-basic-surrender', 'emoji-basic-tears',
    ]);

    const ids = new Set(summary.entitlements.map((e) => e.itemId));
    assert.equal(ids.size, 25, '중복 보유가 없어야 한다');

    assert.equal(summary.loadout.selectedProfilePhotoId, DEFAULT_PROFILE_PHOTO_ID);
    assert.equal(summary.loadout.selectedProfileBorderId, DEFAULT_PROFILE_BORDER_ID);
    assert.equal(summary.balanceGold, 0);
    assert.equal(summary.balanceDiamond, 0, 'F-08 요구사항: DIAMOND 잔액도 초기값 0이어야 한다');
});

test('A-04: 이미 유효한 선택값이 있는 계정은 기본 지급 시에도 선택값이 바뀌지 않는다', async () => {
    const db = createFakeDb();
    const userId = 'user-a04';

    await economyService.ensureDefaultEntitlements(userId, db);
    await economyService.equipItem({ userId, slot: 'PROFILE_PHOTO', itemId: 'player-profile-기사' }, db);

    await economyService.ensureDefaultEntitlements(userId, db);

    const summary = await economyService.getWalletSummary(userId, db);
    assert.equal(summary.loadout.selectedProfilePhotoId, 'player-profile-기사', '기존 유효 선택을 덮어쓰면 안 된다');
});

test('AC-03(R-IMPL): ensureDefaultLoadout의 조건부 갱신은 스냅샷을 읽은 뒤·쓰기 전 사이에 커밋된 동시 equip 결과를 덮어쓰지 않는다', async () => {
    const db = createFakeDb();
    const userId = 'user-ac03-race';
    const { applyLedgerTransaction, ensureDefaultLoadout } = economyService.__internal;

    await applyLedgerTransaction(db, {
        userId, reason: 'DEFAULT_GRANT', currency: CURRENCIES.GOLD, amount: 0,
        itemId: PURCHASABLE_ITEM_ID, itemType: 'PROFILE_BORDER',
        referenceEventId: `seed-item-${userId}`, entitlementSource: 'DEFAULT_GRANT',
    });

    const models = db.sequelize.models;
    const originalFindOrCreate = models.EconomyLoadout.findOrCreate;
    models.EconomyLoadout.findOrCreate = async (...args) => {
        models.EconomyLoadout.findOrCreate = originalFindOrCreate;
        const result = await originalFindOrCreate.apply(models.EconomyLoadout, args);
        await economyService.equipItem({ userId, slot: 'PROFILE_BORDER', itemId: PURCHASABLE_ITEM_ID }, db);
        return result;
    };

    await ensureDefaultLoadout(db, userId);

    const loadout = await models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_border_id, PURCHASABLE_ITEM_ID, '동시에 커밋된 유효 선택을 기본값이 덮어쓰면 안 된다');
});

test('AC-03(R-IMPL): 지갑 조회 없이 곧바로 기본 프로필을 장착해도 자동으로 기본 지급된 뒤 성공한다', async () => {
    const db = createFakeDb();
    const userId = 'user-ac03-equip-first';

    const loadout = await economyService.equipItem({ userId, slot: 'PROFILE_PHOTO', itemId: DEFAULT_PROFILE_PHOTO_ID }, db);
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID);

    const owned = db._inspect.entitlements.filter((e) => e.user_id === userId);
    assert.equal(owned.length, 25, '장착이 트리거한 자동 기본 지급으로 25종을 모두 보유해야 한다');
});

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

test('AC-04(F-08 요구사항): DIAMOND 재화 지급은 balance_diamond만 바꾸고 GOLD는 그대로 둔다', async () => {
    const db = createFakeDb();
    const userId = 'user-ac04-diamond';

    const result = await economyService.grantReward({ userId, amount: 50, currency: CURRENCIES.DIAMOND, referenceEventId: `diamond-${userId}` }, db);
    assert.equal(result.idempotent, false);
    assert.equal(result.ledgerEntry.currency, CURRENCIES.DIAMOND);

    const wallet = db._inspect.walletsByUser.get(userId);
    assert.equal(wallet.balance_diamond, 50);
    assert.equal(wallet.balance_gold, 0, 'DIAMOND 지급이 GOLD 잔액을 바꾸면 안 된다');
});

test('금액이 안전한 정수 범위를 벗어나면 지갑을 건드리기 전에 거부된다(오버플로 방지)', async () => {
    const db = createFakeDb();
    const userId = 'user-overflow';

    await assert.rejects(
        () => economyService.grantReward({ userId, amount: 2_000_000_000, referenceEventId: `overflow-${userId}` }, db),
        (error) => error.code === 'AMOUNT_OUT_OF_RANGE',
    );
    assert.equal(db._inspect.walletsByUser.has(userId), false, '거부된 요청은 지갑 행조차 만들면 안 된다');
});

test('알 수 없는 재화(currency)로 지급하면 거부된다', async () => {
    const db = createFakeDb();
    const userId = 'user-bad-currency';

    await assert.rejects(
        () => economyService.grantReward({ userId, amount: 100, currency: 'BITCOIN', referenceEventId: `bad-${userId}` }, db),
        (error) => error.code === 'INVALID_CURRENCY',
    );
});

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
    await economyService.ensureDefaultEntitlements(userId, db);

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

test('CODEX-2(AC-03): applyLedgerTransaction이 외부(부모) 트랜잭션을 받으면 새 트랜잭션을 열지 않고 그 위에서 실행된다', async () => {
    const db = createFakeDb();
    const userId = 'user-parent-tx';
    const originalTransaction = db.sequelize.transaction;
    let transactionCallCount = 0;
    db.sequelize.transaction = (fn) => { transactionCallCount += 1; return originalTransaction(fn); };

    await db.sequelize.transaction(async (t) => {
        await economyService.__internal.applyLedgerTransaction(db, {
            userId, reason: 'TEST_SEED', currency: CURRENCIES.GOLD, amount: 100,
            referenceEventId: `parent-tx-${userId}`,
        }, { transaction: t });
    });

    assert.equal(transactionCallCount, 1, '부모 트랜잭션 하나만 열려야 하고, 내부에서 경쟁하는 새 트랜잭션을 추가로 열면 안 된다');
    const wallet = db._inspect.walletsByUser.get(userId);
    assert.equal(wallet.balance_gold, 100);
});

test('CODEX-2(AC-03): 부모 트랜잭션이 이후 단계에서 실패해 롤백되면 그 안에서 일어난 지갑 갱신도 함께 되돌려진다', async () => {
    const db = createFakeDb();
    const userId = 'user-parent-tx-rollback';
    await grantBalance(db, userId, 500);

    await assert.rejects(
        () => db.sequelize.transaction(async (t) => {
            await economyService.__internal.applyLedgerTransaction(db, {
                userId, reason: 'TEST_SEED', currency: CURRENCIES.GOLD, amount: 300,
                referenceEventId: `parent-tx-rollback-${userId}`,
            }, { transaction: t });
            throw new Error('시뮬레이션된 계정 생성 실패(이후 단계)');
        }),
        /시뮬레이션된 계정 생성 실패/,
    );

    const wallet = db._inspect.walletsByUser.get(userId);
    assert.equal(wallet.balance_gold, 500, '부모 트랜잭션이 롤백되면 그 안에서 일어난 지갑 갱신도 되돌려져야 한다');
});

test('CODEX-2(AC-03): ensureDefaultEntitlements도 외부 트랜잭션을 받으면 같은 트랜잭션 위에서 기본 지급을 모두 마친다(회원가입 훅 흉내)', async () => {
    const db = createFakeDb();
    const userId = 'user-signup-parent-tx';

    await db.sequelize.transaction(async (t) => {
        await economyService.ensureDefaultEntitlements(userId, db, { transaction: t });
    });

    const granted = db._inspect.entitlements.filter((e) => e.user_id === userId);
    assert.equal(granted.length, 25, '부모 트랜잭션 안에서도 25종(프로필 16 + 테두리 1 + 기본 이모티콘 8)이 모두 지급되어야 한다');

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID, '부모 트랜잭션 안에서도 기본 선택값이 채워져야 한다');
    assert.equal(loadout.selected_profile_border_id, DEFAULT_PROFILE_BORDER_ID);
});

const currentRevision = async (db, userId) => (await economyService.getWalletSummary(userId, db)).loadout.revision;

test('F-13 AC-02: 사진·테두리를 동시에 정당하게 보유한 상태로 확정하면 두 컬럼과 revision이 모두 갱신된다', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-joint-ok';
    await grantBalance(db, userId, 1000);
    await economyService.purchaseItem({ userId, itemId: PURCHASABLE_ITEM_ID, referenceEventId: `buy-${userId}` }, db);
    const expectedRevision = await currentRevision(db, userId);

    const loadout = await economyService.equipProfileAppearance({
        userId,
        photoItemId: 'player-profile-기사',
        borderItemId: PURCHASABLE_ITEM_ID,
        expectedRevision,
    }, db);

    assert.equal(loadout.selected_profile_photo_id, 'player-profile-기사');
    assert.equal(loadout.selected_profile_border_id, PURCHASABLE_ITEM_ID);
    assert.notEqual(loadout.revision, expectedRevision, '성공적인 확정은 항상 새 revision을 발급해야 한다(A-10)');
});

test('F-13 AC-01: 테두리를 보유하지 않은 채 사진과 함께 확정을 요청하면 거부되고 사진도 저장되지 않는다', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-joint-unowned-border';
    const expectedRevision = await currentRevision(db, userId);

    await assert.rejects(
        () => economyService.equipProfileAppearance({
            userId,
            photoItemId: 'player-profile-기사',
            borderItemId: 'profile-border-황제',
            expectedRevision,
        }, db),
        (error) => error.status === 403 && error.code === 'ITEM_NOT_OWNED',
    );

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID, '검증에 실패하면 사진 슬롯도 저장되지 않아 기본값 그대로여야 한다(부분 저장 금지)');
    assert.equal(loadout.selected_profile_border_id, DEFAULT_PROFILE_BORDER_ID);
    assert.equal(loadout.revision, expectedRevision, '거부된 요청은 revision도 바꾸면 안 된다');
});

test('F-13 AC-01(CODEX-4): 소유권 행만 사라진(원장은 그대로인) 기본 사진은 ensureDefaultEntitlements가 조용히 재지급하지 않고 equipProfileAppearance가 실제로 거부한다', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-photo-entitlement-gap';
    const expectedRevision = await currentRevision(db, userId);

    const idx = db._inspect.entitlements.findIndex((e) => e.user_id === userId && e.item_id === 'player-profile-기사');
    assert.notEqual(idx, -1, '사전 조건: 기본 지급으로 이미 보유하고 있어야 한다');
    db._inspect.entitlements.splice(idx, 1);

    await assert.rejects(
        () => economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', expectedRevision }, db),
        (error) => error.status === 403 && error.code === 'ITEM_NOT_OWNED',
        'equipProfileAppearance 내부의 ensureDefaultEntitlements 재호출이 소유권을 조용히 복구하면 안 된다',
    );

    assert.equal(
        db._inspect.entitlements.some((e) => e.user_id === userId && e.item_id === 'player-profile-기사'),
        false,
        'ensureDefaultEntitlements가 원장 존재만으로 소유권 행을 재발급하면 이 거부 경로 자체가 사라진다 — 재발급되지 않아야 한다',
    );

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID, '거부된 요청은 기존 사진 선택을 바꾸면 안 된다');
});

test('F-13 AC-01: 사진 슬롯에 테두리 itemId를 보내면 종류 불일치로 거부되고 기존 선택은 그대로 유지된다', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-joint-typemismatch';
    const firstRevision = await currentRevision(db, userId);
    const afterFirst = await economyService.equipProfileAppearance({ userId, photoItemId: DEFAULT_PROFILE_PHOTO_ID, expectedRevision: firstRevision }, db);

    await assert.rejects(
        () => economyService.equipProfileAppearance({
            userId,
            photoItemId: DEFAULT_PROFILE_BORDER_ID,
            borderItemId: DEFAULT_PROFILE_BORDER_ID,
            expectedRevision: afterFirst.revision,
        }, db),
        (error) => error.status === 400 && error.code === 'ITEM_TYPE_MISMATCH',
    );

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID, '실패한 확정 시도가 이전 사진 선택을 바꾸면 안 된다');
});

test('F-13 AC-02: 사진만 바뀐 확인은 borderItemId 없이 photoItemId만 보내면 테두리 컬럼을 건드리지 않는다', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-photo-only';
    const firstRevision = await currentRevision(db, userId);
    const afterFirst = await economyService.equipProfileAppearance({ userId, photoItemId: DEFAULT_PROFILE_PHOTO_ID, borderItemId: DEFAULT_PROFILE_BORDER_ID, expectedRevision: firstRevision }, db);

    const loadout = await economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', expectedRevision: afterFirst.revision }, db);
    assert.equal(loadout.selected_profile_photo_id, 'player-profile-기사');
    assert.equal(loadout.selected_profile_border_id, DEFAULT_PROFILE_BORDER_ID, '넘기지 않은 테두리 슬롯은 그대로 유지되어야 한다');
});

test('F-13 AC-02: 아무 슬롯도 넘기지 않으면 거부된다', async () => {
    const db = createFakeDb();
    await assert.rejects(
        () => economyService.equipProfileAppearance({ userId: 'user-f13-empty', expectedRevision: 'irrelevant' }, db),
        (error) => error.status === 400 && error.code === 'EMPTY_PROFILE_EQUIP_REQUEST',
    );
});

test('F-13 AC-02: 겹치지 않는 순차 확정에서는 나중 호출이 이전 값을 정상적으로 대체한다(행 잠금 원자성 회귀 방지)', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-sequential-order';
    await grantBalance(db, userId, 1000);
    await economyService.purchaseItem({ userId, itemId: PURCHASABLE_ITEM_ID, referenceEventId: `buy-${userId}` }, db);
    const revision1 = await currentRevision(db, userId);

    const afterFirst = await economyService.equipProfileAppearance({ userId, borderItemId: DEFAULT_PROFILE_BORDER_ID, expectedRevision: revision1 }, db);
    const result = await economyService.equipProfileAppearance({ userId, borderItemId: PURCHASABLE_ITEM_ID, expectedRevision: afterFirst.revision }, db);

    assert.equal(result.selected_profile_border_id, PURCHASABLE_ITEM_ID, '나중에 호출된 확정이 이전 값을 정상적으로 대체해야 한다');
});

test('F-13 AC-02: clientIntentAt은 더 이상 인자로 받지 않는다(구버전 클라이언트·프록시 잔재가 실려도 조용히 무시된다)', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-ignored-intent-field';
    await grantBalance(db, userId, 1000);
    await economyService.purchaseItem({ userId, itemId: PURCHASABLE_ITEM_ID, referenceEventId: `buy-${userId}` }, db);
    const expectedRevision = await currentRevision(db, userId);

    const result = await economyService.equipProfileAppearance({ userId, borderItemId: PURCHASABLE_ITEM_ID, expectedRevision, clientIntentAt: 12345 }, db);

    assert.equal(result.selected_profile_border_id, PURCHASABLE_ITEM_ID, 'clientIntentAt은 더 이상 읽히지 않으므로 갱신 자체는 정상 적용되어야 한다');
});

test('F-13 AC-02(A-01): expectedRevision이 없거나 형식이 잘못되면 거부되고 장착값이 바뀌지 않는다', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-missing-revision';
    const expectedRevision = await currentRevision(db, userId);

    for (const badRevision of [undefined, '', 123, null]) {
        await assert.rejects(
            () => economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', expectedRevision: badRevision }, db),
            (error) => error.status === 400 && error.code === 'MISSING_EXPECTED_REVISION',
        );
    }

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID, 'expectedRevision 누락·오형식 요청이 장착값을 바꾸면 안 된다');
    assert.equal(loadout.revision, expectedRevision, 'expectedRevision 누락·오형식 요청이 revision도 바꾸면 안 된다');
});

test('F-13 AC-02(A-01): 오래된(이미 다른 확정이 먼저 커밋한) revision으로 확정을 요청하면 409로 거부되고 아무 컬럼도 바뀌지 않는다', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-stale-revision';
    const staleRevision = await currentRevision(db, userId);

    const committed = await economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', expectedRevision: staleRevision }, db);
    assert.notEqual(committed.revision, staleRevision);

    await assert.rejects(
        () => economyService.equipProfileAppearance({ userId, borderItemId: DEFAULT_PROFILE_BORDER_ID, expectedRevision: staleRevision }, db),
        (error) => error.status === 409 && error.code === 'PROFILE_REVISION_CONFLICT',
    );

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, 'player-profile-기사', '충돌로 거부된 요청은 이미 커밋된 값을 바꾸면 안 된다');
    assert.equal(loadout.selected_profile_border_id, DEFAULT_PROFILE_BORDER_ID, '충돌로 거부된 요청이 의도한 값이 실제로 커밋되면 안 된다(부분 저장 금지)');
    assert.equal(loadout.revision, committed.revision, '거부된 요청은 revision도 바꾸면 안 된다');
});

test('F-13 AC-02(A-01): 같은 오래된 revision을 들고 동시에 경쟁하는 두 확정 중 정확히 하나만 성공한다(동시 CAS 경쟁)', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-cas-race';
    const revision = await currentRevision(db, userId);

    const [settledA, settledB] = await Promise.allSettled([
        economyService.equipProfileAppearance({ userId, borderItemId: DEFAULT_PROFILE_BORDER_ID, expectedRevision: revision }, db),
        economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', expectedRevision: revision }, db),
    ]);

    const fulfilled = [settledA, settledB].filter((r) => r.status === 'fulfilled');
    const rejected = [settledA, settledB].filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1, '같은 오래된 revision으로 경쟁하는 두 확정 중 정확히 하나만 성공해야 한다');
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 'PROFILE_REVISION_CONFLICT');
});

test('F-13 AC-02(A-10, ABA 방지): 같은 값을 다시 명시적으로 저장해도 매번 새 revision을 받고, 무효화된 오래된 revision은 값이 우연히 같아져도 재유효화되지 않는다', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-aba';
    const revision0 = await currentRevision(db, userId);

    const toB = await economyService.equipProfileAppearance({ userId, borderItemId: 'profile-border-평민', expectedRevision: revision0 }, db);
    const backToDefault = await economyService.equipProfileAppearance({ userId, borderItemId: DEFAULT_PROFILE_BORDER_ID, expectedRevision: toB.revision }, db);

    assert.notEqual(backToDefault.revision, revision0, '값이 원래(revision0 시점)와 같아도 명시적 재저장은 새 revision을 받아야 한다');

    await assert.rejects(
        () => economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', expectedRevision: revision0 }, db),
        (error) => error.code === 'PROFILE_REVISION_CONFLICT',
        'ABA(같은 값으로 되돌아온) 상황에서도 오래된 revision0은 다시 유효해지면 안 된다',
    );
});

test('F-13(F0394 equipItem): 일반 장착(카드 프레임)도 같은 행을 갱신하면 revision을 새로 발급해, 프로필 편집기가 들고 있던 이전 revision을 무효화한다', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-equipitem-invalidates';
    const staleRevision = await currentRevision(db, userId);

    await economyService.equipItem({ userId, slot: 'PLAYER_CARD_FRAME', itemId: economyService.FREE_CARD_FRAME_ID }, db);

    await assert.rejects(
        () => economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', expectedRevision: staleRevision }, db),
        (error) => error.code === 'PROFILE_REVISION_CONFLICT',
        'equipItem이 같은 행의 revision을 이미 전진시켰으므로 편집기가 들고 있던 이전 revision은 무효해야 한다',
    );

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_card_frame_id, economyService.FREE_CARD_FRAME_ID, 'equipItem 자신의 갱신은 정상적으로 반영되어야 한다');
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID, '거부된 프로필 확정은 사진 컬럼을 바꾸면 안 된다');
});

test('F-13 AC-05: getPublicProfileLoadouts는 대상 계정의 사진·테두리 id만 돌려주고 지갑·소유 목록은 포함하지 않는다', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-public-a';
    const expectedRevision = await currentRevision(db, userId);
    await economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', borderItemId: DEFAULT_PROFILE_BORDER_ID, expectedRevision }, db);

    const result = await economyService.getPublicProfileLoadouts([userId], db);
    assert.deepEqual(result[userId], { profilePhotoId: 'player-profile-기사', profileBorderId: DEFAULT_PROFILE_BORDER_ID });
    assert.equal('balanceGold' in result[userId], false);
    assert.equal('entitlements' in result[userId], false);
});

test('F-13 AC-05: 아직 경제 시스템을 한 번도 건드리지 않은 신규 계정도 조회 시 기본 지급을 보장받아 기본값으로 노출된다', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-public-fresh';

    const result = await economyService.getPublicProfileLoadouts([userId], db);
    assert.deepEqual(result[userId], { profilePhotoId: DEFAULT_PROFILE_PHOTO_ID, profileBorderId: DEFAULT_PROFILE_BORDER_ID });
});

test('F-13 AC-05: 여러 계정을 한 번에 조회해도 계정별로 서로 다른 결과가 섞이지 않는다', async () => {
    const db = createFakeDb();
    const userA = 'user-f13-public-multi-a';
    const userB = 'user-f13-public-multi-b';
    const revisionA = await currentRevision(db, userA);
    const revisionB = await currentRevision(db, userB);
    await economyService.equipProfileAppearance({ userId: userA, photoItemId: 'player-profile-기사', expectedRevision: revisionA }, db);
    await economyService.equipProfileAppearance({ userId: userB, photoItemId: 'player-profile-드워프', expectedRevision: revisionB }, db);

    const result = await economyService.getPublicProfileLoadouts([userA, userB], db);
    assert.equal(result[userA].profilePhotoId, 'player-profile-기사');
    assert.equal(result[userB].profilePhotoId, 'player-profile-드워프');
});

const GUARD_SKIN_ITEM_ID = 'player-skin-경비원1-바이올렛';
const NOBLE_SKIN_ITEM_ID = 'player-skin-귀족1-블러드';

test('F-14 AC-01: 정당히 보유한 직업 스킨을 장착하면 해당 컬럼에 저장되고 getWalletSummary로 그대로 복원된다', async () => {
    const db = createFakeDb();
    const userId = 'user-f14-ac01-owned';
    await grantBalance(db, userId, 1000);
    await economyService.purchaseItem({ userId, itemId: GUARD_SKIN_ITEM_ID, referenceEventId: `buy-${userId}` }, db);

    const loadout = await economyService.equipItem({ userId, slot: 'JOB_SKIN_GUARD', itemId: GUARD_SKIN_ITEM_ID }, db);
    assert.equal(loadout.selected_skin_guard, GUARD_SKIN_ITEM_ID);

    const summary = await economyService.getWalletSummary(userId, db);
    assert.equal(summary.loadout.selectedSkinsByJob.guard, GUARD_SKIN_ITEM_ID);
    assert.equal(summary.loadout.selectedSkinsByJob.noble, null, '건드리지 않은 다른 직업 슬롯은 null(미장착)이어야 한다');
});

test('F-14 AC-01: 무료 기본 스킨(basic-skin-*)은 구매 없이도 해당 직업 슬롯에 장착된다', async () => {
    const db = createFakeDb();
    const userId = 'user-f14-ac01-free';

    const loadout = await economyService.equipItem({ userId, slot: 'JOB_SKIN_NOBLE', itemId: 'basic-skin-귀족2' }, db);
    assert.equal(loadout.selected_skin_noble, 'basic-skin-귀족2');
});

test('F-14 AC-02: 미보유 직업 스킨을 장착 요청하면 거부되고 장착값이 바뀌지 않는다', async () => {
    const db = createFakeDb();
    const userId = 'user-f14-ac02-unowned';

    await assert.rejects(
        () => economyService.equipItem({ userId, slot: 'JOB_SKIN_GUARD', itemId: GUARD_SKIN_ITEM_ID }, db),
        (error) => error.status === 403 && error.code === 'ITEM_NOT_OWNED',
    );
    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout?.selected_skin_guard ?? null, null, '거부된 요청은 컬럼을 전혀 건드리면 안 된다');
});

test('F-14 AC-02: 다른 직업에서 구매한 스킨을 이 슬롯에 장착하면(직업 불일치) 거부된다', async () => {
    const db = createFakeDb();
    const userId = 'user-f14-ac02-jobmismatch';
    await grantBalance(db, userId, 1000);
    await economyService.purchaseItem({ userId, itemId: NOBLE_SKIN_ITEM_ID, referenceEventId: `buy-${userId}` }, db);

    await assert.rejects(
        () => economyService.equipItem({ userId, slot: 'JOB_SKIN_GUARD', itemId: NOBLE_SKIN_ITEM_ID }, db),
        (error) => error.status === 400 && error.code === 'ITEM_TYPE_MISMATCH',
    );
});

test('F-14 AC-02: 존재하지 않는 basic-skin-* 접두어 위조 id(basic-skin-귀족garbage)는 무료 예외로 통과하지 못하고 거부된다', async () => {
    const db = createFakeDb();
    const userId = 'user-f14-ac02-forged-free';

    await assert.rejects(
        () => economyService.equipItem({ userId, slot: 'JOB_SKIN_NOBLE', itemId: 'basic-skin-귀족garbage' }, db),
        (error) => error.status === 400 && error.code === 'ITEM_TYPE_MISMATCH',
    );
});

test('F-14: getGameStartLoadouts는 공개(사진·테두리·카드 프레임)와 비공개(직업별 스킨) 정보를 함께 돌려준다(내부 전용 조회)', async () => {
    const db = createFakeDb();
    const userId = 'user-f14-gamestart';
    await grantBalance(db, userId, 1000);
    await economyService.purchaseItem({ userId, itemId: GUARD_SKIN_ITEM_ID, referenceEventId: `buy-skin-${userId}` }, db);
    await economyService.purchaseItem({ userId, itemId: 'player-card-왕관', referenceEventId: `buy-card-${userId}` }, db);
    await economyService.equipItem({ userId, slot: 'JOB_SKIN_GUARD', itemId: GUARD_SKIN_ITEM_ID }, db);
    await economyService.equipItem({ userId, slot: 'PLAYER_CARD_FRAME', itemId: 'player-card-왕관' }, db);

    const result = await economyService.getGameStartLoadouts([userId], db);
    assert.equal(result[userId].profilePhotoId, DEFAULT_PROFILE_PHOTO_ID);
    assert.equal(result[userId].cardFrameId, 'player-card-왕관');
    assert.equal(result[userId].skinsByJob.guard, GUARD_SKIN_ITEM_ID);
    assert.equal(result[userId].skinsByJob.noble, null);
});

test('F-14 AC-01(P1): expectedRevision을 보내지 않으면(레거시 호출) CAS 비교 없이 이전처럼 즉시 커밋된다', async () => {
    const db = createFakeDb();
    const userId = 'user-f14-cas-legacy';
    await grantBalance(db, userId, 1000);
    await economyService.purchaseItem({ userId, itemId: GUARD_SKIN_ITEM_ID, referenceEventId: `buy-${userId}` }, db);

    const loadout = await economyService.equipItem({ userId, slot: 'JOB_SKIN_GUARD', itemId: GUARD_SKIN_ITEM_ID }, db);
    assert.equal(loadout.selected_skin_guard, GUARD_SKIN_ITEM_ID, 'expectedRevision을 생략해도 갱신은 정상 커밋되어야 한다');
});

test('F-14 AC-01(P1): 오래된(이미 다른 확정이 먼저 커밋한) revision으로 스킨 장착을 요청하면 409 SKIN_REVISION_CONFLICT로 거부되고 아무 컬럼도 바뀌지 않는다', async () => {
    const db = createFakeDb();
    const userId = 'user-f14-cas-stale';
    await grantBalance(db, userId, 1000);
    await economyService.purchaseItem({ userId, itemId: GUARD_SKIN_ITEM_ID, referenceEventId: `buy-guard-${userId}` }, db);
    await economyService.purchaseItem({ userId, itemId: NOBLE_SKIN_ITEM_ID, referenceEventId: `buy-noble-${userId}` }, db);
    const staleRevision = await currentRevision(db, userId);

    const committed = await economyService.equipItem({ userId, slot: 'JOB_SKIN_GUARD', itemId: GUARD_SKIN_ITEM_ID, expectedRevision: staleRevision }, db);
    assert.notEqual(committed.revision, staleRevision);

    await assert.rejects(
        () => economyService.equipItem({ userId, slot: 'JOB_SKIN_NOBLE', itemId: NOBLE_SKIN_ITEM_ID, expectedRevision: staleRevision }, db),
        (error) => error.status === 409 && error.code === 'SKIN_REVISION_CONFLICT',
    );

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_skin_guard, GUARD_SKIN_ITEM_ID, '충돌로 거부된 요청은 이미 커밋된 값을 바꾸면 안 된다');
    assert.equal(loadout.selected_skin_noble ?? null, null, '충돌로 거부된 요청이 의도한 값이 실제로 커밋되면 안 된다(부분 저장 금지)');
    assert.equal(loadout.revision, committed.revision, '거부된 요청은 revision도 바꾸면 안 된다');
});

test('F-14 AC-01(P1): 같은 오래된 revision을 들고 동시에 경쟁하는 두 스킨 장착 요청 중 정확히 하나만 성공한다(동시 CAS 경쟁)', async () => {
    const db = createFakeDb();
    const userId = 'user-f14-cas-race';
    await grantBalance(db, userId, 1000);
    await economyService.purchaseItem({ userId, itemId: GUARD_SKIN_ITEM_ID, referenceEventId: `buy-guard-${userId}` }, db);
    await economyService.purchaseItem({ userId, itemId: NOBLE_SKIN_ITEM_ID, referenceEventId: `buy-noble-${userId}` }, db);
    const revision = await currentRevision(db, userId);

    const [settledA, settledB] = await Promise.allSettled([
        economyService.equipItem({ userId, slot: 'JOB_SKIN_GUARD', itemId: GUARD_SKIN_ITEM_ID, expectedRevision: revision }, db),
        economyService.equipItem({ userId, slot: 'JOB_SKIN_NOBLE', itemId: NOBLE_SKIN_ITEM_ID, expectedRevision: revision }, db),
    ]);

    const fulfilled = [settledA, settledB].filter((r) => r.status === 'fulfilled');
    const rejected = [settledA, settledB].filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1, '같은 오래된 revision으로 경쟁하는 두 스킨 장착 중 정확히 하나만 성공해야 한다');
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 'SKIN_REVISION_CONFLICT');
});

test('F-14 AC-01(P1): 직업 스킨 장착(equipItem)과 프로필 확정(equipProfileAppearance)은 같은 revision 컬럼을 공유하므로, 한쪽이 먼저 커밋되면 다른 쪽의 오래된 revision도 충돌로 거부된다', async () => {
    const db = createFakeDb();
    const userId = 'user-f14-cas-cross-write';
    await grantBalance(db, userId, 1000);
    await economyService.purchaseItem({ userId, itemId: GUARD_SKIN_ITEM_ID, referenceEventId: `buy-${userId}` }, db);
    const staleRevision = await currentRevision(db, userId);

    await economyService.equipItem({ userId, slot: 'JOB_SKIN_GUARD', itemId: GUARD_SKIN_ITEM_ID, expectedRevision: staleRevision }, db);

    await assert.rejects(
        () => economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', expectedRevision: staleRevision }, db),
        (error) => error.status === 409 && error.code === 'PROFILE_REVISION_CONFLICT',
        '스킨 장착이 이미 같은 행의 revision을 전진시켰으므로, 그 이전 revision을 든 프로필 확정은 거부되어야 한다',
    );

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID, '거부된 프로필 확정이 사진 선택을 바꾸면 안 된다');
    assert.equal(loadout.selected_skin_guard, GUARD_SKIN_ITEM_ID, '먼저 커밋된 스킨 장착은 그대로 유지되어야 한다');
});
