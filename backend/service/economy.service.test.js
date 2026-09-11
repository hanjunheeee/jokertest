'use strict';

// F-08 economy.service.js 단위 시험. 실제 MySQL 없이도 AC-01(동시 구매 무결성)·
// AC-02(재처리 방지 키)·AC-03(기본 지급)·AC-04(서버 가격 신뢰)·AC-05(소유권·종류 검증)·
// AC-06(계정 격리)를 검증하기 위해, Sequelize 모델과 같은 호출 계약({find,create,update,
// lock} 등)만 흉내 내는 인메모리 fake db를 주입한다(backend/service/concurrency.service.js가
// 이미 쓰는 model 주입 패턴과 같다). 지갑 행 잠금(SELECT ... FOR UPDATE)은 사용자별 순서
// 큐로 흉내 내, 서비스가 실제로 "잠금 → 재처리 방지 재확인 → 소유 여부 확인" 순서를
// 지키는지까지 검증한다 — 순서가 어긋나면(소유 여부를 먼저 확인하거나, 재확인을 잠금 밖
// 에서만 한다) 이 fake에서도 AC-01/AC-02 시험이 실패한다.
//
// 실제 MySQL 유일 제약·행 잠금 자체를 검증하는 통합 시험은
// backend/tests/db/f08-economy.integration.test.js에 있다(F01_TEST_DATABASE_URL이
// 없으면 미검증으로 skip — f01~f07과 같은 관례).
//
// R-IMPL(2026-09-10, 반송) 대응: 이전 버전은 참조 사건 ID를 계정과 무관하게 전역
// 조회했다 — 다른 계정이 같은 참조 사건 ID를 제출하면 그 계정의 원장 행을 그대로
// 돌려받았고(계정 간 정보 노출, AC-06), 같은 계정이 같은 키를 다른 내용으로 재전송해도
// "성공"을 잘못 돌려줬다(AC-02). fake의 EconomyLedgerEntry는 이제 (user_id,
// reference_event_id) 복합 키로만 조회·유일성을 판정해, 실제 모델의 복합 유일 인덱스와
// 같은 계약을 흉내낸다.

const test = require('node:test');
const assert = require('node:assert/strict');

const economyService = require('./economy.service');
const { DEFAULT_PROFILE_PHOTO_ID, DEFAULT_PROFILE_BORDER_ID } = require('../economy/catalog');
const { CURRENCIES } = economyService;

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
    //
    // CODEX-2(AC-03) 대응: 실제 InnoDB 행 잠금은 트랜잭션 단위다 — 같은 트랜잭션이 같은
    // 행을 두 번째로 SELECT ... FOR UPDATE해도 자기 자신과는 경합하지 않고 즉시 통과한다
    // (회원가입 트랜잭션 안에서 ensureDefaultEntitlements가 같은 지갑 행을 17번 연속
    // 잠그는 패턴이 실제로 이렇다). lockHolders로 "지금 이 행을 쥔 트랜잭션"을 추적해,
    // 같은 트랜잭션 객체가 재요청하면 큐에 서지 않고 바로 통과시킨다 — 이게 없으면 한
    // 트랜잭션 안에서의 재진입 요청이 자기 자신의 이전 요청이 풀리길 기다리며 교착된다.
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

    // F-13 AC-02(CODEX-9): EconomyLoadout 전용 잠금 — 실제 DB에서는 EconomyWallet 행과
    // EconomyLoadout 행이 서로 다른 행이라 서로의 잠금과 무관하게 각자 직렬화되므로, 같은
    // mutexTails/lockHolders를 공유하지 않고 독립된 큐를 둔다(위 acquireUserLock과 같은
    // FIFO·재진입 계약).
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

    // 실제 Sequelize는 findOrCreate/findOne이 조회 시점의 컬럼 값을 담은 분리된(disconnected)
    // 인스턴스를 돌려준다 — 그 뒤 다른 커넥션이 같은 행을 UPDATE해도 이미 가져온 인스턴스의
    // 필드는 저절로 바뀌지 않는다(다시 조회해야만 최신값을 본다). 그래서 이 fake도 canonical
    // 저장소(loadoutsByUser)와 "그 시점의 스냅샷 복사본"을 분리한다 — 그래야
    // ensureDefaultLoadout이 스냅샷의 오래된 값을 근거로 무조건 덮어쓰면(read-then-blind-write)
    // 동시 equip의 실제 커밋을 지워버리는 경쟑 상태를, 이 fake로도 재현해 검증할 수 있다.
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
            // 잠금을 실제로 기다린 뒤에는(다른 트랜잭션이 그 사이 커밋했을 수 있다) 반드시
            // 최신 canonical 값을 다시 스냅샷해야 한다 — 잠금 대기 전에 만든 스냅샷을
            // 그대로 돌려주면 실제 SELECT ... FOR UPDATE가 잠금 획득 후 최신값을 읽는다는
            // 계약과 달라진다.
            return snapshotLoadout(stored);
        },
        // F-13: getPublicProfileLoadouts의 일괄 조회(where.user_id가 배열)를 흉내낸다 —
        // 실제 Sequelize는 배열 값을 IN절로 변환한다.
        async findAll({ where }) {
            const userIds = Array.isArray(where.user_id) ? where.user_id : [where.user_id];
            return userIds
                .map((userId) => loadoutsByUser.get(userId))
                .filter(Boolean)
                .map(snapshotLoadout);
        },
        // 실제 Sequelize의 모델 수준 Model.update(values, {where})와 같은 계약: where의
        // 모든 조건(예: 특정 컬럼이 "지금" null인지)이 canonical 저장소의 현재 값과 일치할
        // 때만 갱신하고 [affectedCount]를 돌려준다 — 오래된 스냅샷이 아니라 항상 최신
        // 상태를 기준으로 판정한다는 점이 이 조건부 갱신의 원자성을 보장한다.
        async update(patch, { where }) {
            const stored = loadoutsByUser.get(where.user_id);
            if (!stored) return [0];
            const matches = Object.entries(where).every(([key, expected]) => stored[key] === expected);
            if (!matches) return [0];
            Object.assign(stored, patch);
            return [1];
        },
    };

    // 실제 모델의 (user_id, reference_event_id) 복합 유일 인덱스와 같은 계약: 조회·중복
    // 판정 모두 계정 범위로 좁힌다 — 그래야 다른 계정이 같은 문자열을 재사용해도 서로
    // 간섭하지 않는다는 것을 이 fake로도 검증할 수 있다.
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

    // F-09: purchaseItem이 이제 공통 purchaseItems 경로(EconomyPurchaseRequest 기록)를
    // 거치므로, 이 fake도 그 모델을 흉내내야 한다 — 계약은 EconomyLedgerEntry와 같다:
    // (user_id, reference_event_id) 복합 키로만 조회·유일성을 판정한다.
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
        // 테스트가 다음 한 번의 EconomyLedgerEntry.create 호출 직전에 임의의 실패를
        // 주입할 수 있게 한다("injected write failure" 롤백 시험용).
        _interceptNextLedgerCreate: (fn) => { ledgerCreateInterceptor = fn; },
    };
};

const PURCHASABLE_ITEM_ID = 'profile-border-남작'; // priceGold 200
const PURCHASABLE_ITEM_PRICE = 200;
const OTHER_PURCHASABLE_ITEM_ID = 'profile-border-자작'; // priceGold 300

const grantBalance = async (db, userId, amount, currency = CURRENCIES.GOLD) => {
    await economyService.grantReward({ userId, amount, currency, reason: 'TEST_SEED', referenceEventId: `seed:${userId}:${amount}:${Math.random()}` }, db);
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
            // 이전 요청의 상품·금액 등 내용이 에러에 실려서는 안 된다(재사용 응답에 원래
            // 결과를 노출하지 않는다).
            && error.ledgerEntry === undefined
            && !JSON.stringify(error).includes(PURCHASABLE_ITEM_ID),
    );

    // 거부된 재사용 시도가 두 번째 상품을 실제로 지급하면 안 된다.
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
    // 이전 버전의 결함: 전역 조회가 userA의 원장 행을 찾아 userB에게 "idempotent 성공"으로
    // 그대로 돌려줬다(계정 간 정보 노출). 지금은 userB의 조회가 자기 계정 범위로 좁혀져
    // userA의 행을 절대 보지 못하고, 완전히 독립된 새 구매로 처리되어야 한다.
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

    // equipItem의 소유권 검사를 통과하도록 구매 가능 상품(profile-border-남작)의 소유권만
    // 직접 지급해 둔다 — loadout 행은 아직 건드리지 않는다.
    await applyLedgerTransaction(db, {
        userId, reason: 'DEFAULT_GRANT', currency: CURRENCIES.GOLD, amount: 0,
        itemId: PURCHASABLE_ITEM_ID, itemType: 'PROFILE_BORDER',
        referenceEventId: `seed-item-${userId}`, entitlementSource: 'DEFAULT_GRANT',
    });

    // ensureDefaultLoadout이 findOrCreate로 "아직 선택 없음" 스냅샷을 읽은 바로 다음, 실제
    // 조건부 UPDATE를 실행하기 전에 동시 equipItem이 끼어들어 남작 테두리를 먼저 커밋하는
    // 상황을 재현한다. 한 번만 개입하도록 원래 함수로 즉시 되돌려 중첩 호출(equipItem
    // 내부의 ensureDefaultEntitlements→ensureDefaultLoadout)까지 다시 가로채지 않게 한다.
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

    // getWalletSummary(따라서 ensureDefaultEntitlements)를 한 번도 먼저 호출하지 않고
    // 곧바로 기본 프로필(금빛가면)을 장착한다 — 신규 가입 직후 상점을 열지 않고 바로
    // 장착부터 시도하는 클라이언트, 또는 별도 가입 훅 없이 이관된 기존 계정의 첫 접근을
    // 흉내낸다.
    const loadout = await economyService.equipItem({ userId, slot: 'PROFILE_PHOTO', itemId: DEFAULT_PROFILE_PHOTO_ID }, db);
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID);

    const owned = db._inspect.entitlements.filter((e) => e.user_id === userId);
    assert.equal(owned.length, 17, '장착이 트리거한 자동 기본 지급으로 17종을 모두 보유해야 한다');
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

// ── CODEX-2(AC-03): 부모 트랜잭션 재사용(회원가입 등) ───────────────────────
// "lazy grant on wallet/equip is NOT signup/backfill" 지적 대응 — 회원가입은 계정 생성
// 트랜잭션 안에서 ensureDefaultEntitlements/applyLedgerTransaction을 직접 호출해야 하고,
// 그때 새 트랜잭션을 또 열면(경쟁 트랜잭션) 아직 커밋되지 않은 신규 계정을 참조하지
// 못하거나 전체 원자성이 깨진다. 아래는 그 threading이 실제로 이뤄지는지 fake db로
// 검증한다 — 실제 MySQL의 FK/원자성 검증은 backend/tests/db/f08-economy.integration.test.js
// 몫이다.

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
    await grantBalance(db, userId, 500); // 사전 시드(별도 트랜잭션, 이미 커밋됨)

    await assert.rejects(
        () => db.sequelize.transaction(async (t) => {
            await economyService.__internal.applyLedgerTransaction(db, {
                userId, reason: 'TEST_SEED', currency: CURRENCIES.GOLD, amount: 300,
                referenceEventId: `parent-tx-rollback-${userId}`,
            }, { transaction: t });
            // 회원가입이라면 이 뒤에 오는 다른 단계(예: 세션 발급)가 실패하는 상황을 흉내낸다.
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
    assert.equal(granted.length, 17, '부모 트랜잭션 안에서도 기본 프로필 16종 + 평민 테두리 1종이 모두 지급되어야 한다');

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID, '부모 트랜잭션 안에서도 기본 선택값이 채워져야 한다');
    assert.equal(loadout.selected_profile_border_id, DEFAULT_PROFILE_BORDER_ID);
});

// ── F-13 AC-01/AC-02: equipProfileAppearance(사진·테두리 동시 확정) ─────────────

test('F-13 AC-02: 사진·테두리를 동시에 정당하게 보유한 상태로 확정하면 두 컬럼 모두 갱신된다', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-joint-ok';
    await grantBalance(db, userId, 1000);
    await economyService.purchaseItem({ userId, itemId: PURCHASABLE_ITEM_ID, referenceEventId: `buy-${userId}` }, db);

    const loadout = await economyService.equipProfileAppearance({
        userId,
        photoItemId: 'player-profile-기사',
        borderItemId: PURCHASABLE_ITEM_ID,
    }, db);

    assert.equal(loadout.selected_profile_photo_id, 'player-profile-기사');
    assert.equal(loadout.selected_profile_border_id, PURCHASABLE_ITEM_ID);
});

test('F-13 AC-01: 테두리를 보유하지 않은 채 사진과 함께 확정을 요청하면 거부되고 사진도 저장되지 않는다', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-joint-unowned-border';

    await assert.rejects(
        () => economyService.equipProfileAppearance({
            userId,
            photoItemId: 'player-profile-기사',
            borderItemId: 'profile-border-황제', // 보유하지 않음
        }, db),
        (error) => error.status === 403 && error.code === 'ITEM_NOT_OWNED',
    );

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID, '검증에 실패하면 사진 슬롯도 저장되지 않아 기본값 그대로여야 한다(부분 저장 금지)');
    assert.equal(loadout.selected_profile_border_id, DEFAULT_PROFILE_BORDER_ID);
});

test('F-13 AC-01(CODEX-4): 소유권 행만 사라진(원장은 그대로인) 기본 사진은 ensureDefaultEntitlements가 조용히 재지급하지 않고 equipProfileAppearance가 실제로 거부한다', async () => {
    // 배경: 프로필 사진 16종은 전부 defaultGrant:true·purchasable:false(catalog.js)라,
    // "구매하지 않은 프리미엄 사진"이라는 시나리오 자체가 카탈로그에 존재하지 않는다.
    // 그런데도 ITEM_NOT_OWNED는 equipProfileAppearance가 실제로 낼 수 있는 응답이어야
    // 한다 — ensureDefaultEntitlements의 멱등성은 EconomyEntitlement 행이 아니라
    // EconomyLedgerEntry의 결정적 reference_event_id(`default-grant:${userId}:${item.id}`)
    // 로 판정되므로(applyLedgerTransaction의 preExisting 조회), 관리자 수동 회수·부분
    // 마이그레이션 실패 같은 원인으로 원장은 남은 채 소유권 행만 사라지면, 재호출은 "이미
    // 처리된 참조 사건"으로 보고 조용히 넘어가 소유권을 되살리지 않는다 — 이 시험은 가짜
    // catalog 항목을 만들지 않고, 실제 서비스 계약(원장 기준 idempotency)이 만드는 이
    // 데이터 무결성 예외 하나만으로 실제 거부 경로를 고정한다.
    const db = createFakeDb();
    const userId = 'user-f13-photo-entitlement-gap';
    await economyService.getWalletSummary(userId, db); // 기본 16종 사진 + 평민 테두리 지급(원장 포함)

    const idx = db._inspect.entitlements.findIndex((e) => e.user_id === userId && e.item_id === 'player-profile-기사');
    assert.notEqual(idx, -1, '사전 조건: 기본 지급으로 이미 보유하고 있어야 한다');
    db._inspect.entitlements.splice(idx, 1); // 소유권 행만 제거 — 원장(ledgerEntries)은 그대로 둔다

    await assert.rejects(
        () => economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사' }, db),
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
    await economyService.equipProfileAppearance({ userId, photoItemId: DEFAULT_PROFILE_PHOTO_ID }, db);

    await assert.rejects(
        () => economyService.equipProfileAppearance({
            userId,
            photoItemId: DEFAULT_PROFILE_BORDER_ID, // 테두리 itemId를 사진 슬롯에
            borderItemId: DEFAULT_PROFILE_BORDER_ID,
        }, db),
        (error) => error.status === 400 && error.code === 'ITEM_TYPE_MISMATCH',
    );

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID, '실패한 확정 시도가 이전 사진 선택을 바꾸면 안 된다');
});

test('F-13 AC-02: 사진만 바뀐 확인은 borderItemId 없이 photoItemId만 보내면 테두리 컬럼을 건드리지 않는다', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-photo-only';
    await economyService.equipProfileAppearance({ userId, photoItemId: DEFAULT_PROFILE_PHOTO_ID, borderItemId: DEFAULT_PROFILE_BORDER_ID }, db);

    const loadout = await economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사' }, db);
    assert.equal(loadout.selected_profile_photo_id, 'player-profile-기사');
    assert.equal(loadout.selected_profile_border_id, DEFAULT_PROFILE_BORDER_ID, '넘기지 않은 테두리 슬롯은 그대로 유지되어야 한다');
});

test('F-13 AC-02: 아무 슬롯도 넘기지 않으면 거부된다', async () => {
    const db = createFakeDb();
    await assert.rejects(
        () => economyService.equipProfileAppearance({ userId: 'user-f13-empty' }, db),
        (error) => error.status === 400 && error.code === 'EMPTY_PROFILE_EQUIP_REQUEST',
    );
});

// ── F-13 AC-02 설계 감사(운영자, 2026-09-11): clientIntentAt/인메모리 Map 제거 ──────
//
// 이전 CODEX-9 버전은 클라이언트 벽시계 시각(clientIntentAt)과 인메모리 Map으로 겹치는
// 확정의 "의도 순서"를 서버가 재구성하려 했으나, (1) 같은 밀리초 충돌로 유효한 갱신을
// 잃고 (2) 시계 역행/오차가 정당한 나중 요청을 거부하며 (3) Map이 트랜잭션 커밋보다 먼저
// 갱신돼 롤백에도 의도가 전진하고 재시작·다중 인스턴스에서 사라진다는 세 가지 결함이 있어
// 제거했다(economy.service.js의 equipProfileAppearance 주석 참고). 아래 시험은 그 필드가
// 남아 있지 않음(넘겨도 조용히 무시됨)과, 겹치지 않는 정상 순차 호출에서는 여전히 나중
// 호출이 이전 값을 정상적으로 대체함(행 잠금에 의한 전부-아니면-무 원자성 자체는 그대로
// 유효함)을 고정한다. "실제 네트워크 재정렬로 도착 순서가 뒤바뀌어도 서버가 의도 순서를
// 보존한다"는 보장 자체는 더 이상 서버 책임이 아니다 — 화면 정합성은 economy.store.js의
// loadoutAttemptSeq(순수 클라이언트 로컬 판단)가 별도로 보장한다(economy.store.test.js 참고).

test('F-13 AC-02(설계 감사): 겹치지 않는 순차 확정에서는 나중 호출이 이전 값을 정상적으로 대체한다(행 잠금 원자성 회귀 방지)', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-sequential-order';
    await grantBalance(db, userId, 1000);
    await economyService.purchaseItem({ userId, itemId: PURCHASABLE_ITEM_ID, referenceEventId: `buy-${userId}` }, db);

    await economyService.equipProfileAppearance({ userId, borderItemId: DEFAULT_PROFILE_BORDER_ID }, db);
    const result = await economyService.equipProfileAppearance({ userId, borderItemId: PURCHASABLE_ITEM_ID }, db);

    assert.equal(result.selected_profile_border_id, PURCHASABLE_ITEM_ID, '나중에 호출된 확정이 이전 값을 정상적으로 대체해야 한다');
});

test('F-13 AC-02(설계 감사): clientIntentAt을 실어 보내도(구버전 클라이언트·프록시 잔재 등) 조용히 무시되고 갱신 자체는 정상 적용된다', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-ignored-intent-field';
    await grantBalance(db, userId, 1000);
    await economyService.purchaseItem({ userId, itemId: PURCHASABLE_ITEM_ID, referenceEventId: `buy-${userId}` }, db);

    const result = await economyService.equipProfileAppearance({ userId, borderItemId: PURCHASABLE_ITEM_ID, clientIntentAt: 12345 }, db);

    assert.equal(result.selected_profile_border_id, PURCHASABLE_ITEM_ID, 'clientIntentAt은 더 이상 읽히지 않으므로 갱신 자체는 정상 적용되어야 한다');
});

// ── F-13 AC-05 전제: getPublicProfileLoadouts(대기방·인게임 공개 노출) ──────────

test('F-13 AC-05: getPublicProfileLoadouts는 대상 계정의 사진·테두리 id만 돌려주고 지갑·소유 목록은 포함하지 않는다', async () => {
    const db = createFakeDb();
    const userId = 'user-f13-public-a';
    await economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', borderItemId: DEFAULT_PROFILE_BORDER_ID }, db);

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
    await economyService.equipProfileAppearance({ userId: userA, photoItemId: 'player-profile-기사' }, db);
    await economyService.equipProfileAppearance({ userId: userB, photoItemId: 'player-profile-드워프' }, db);

    const result = await economyService.getPublicProfileLoadouts([userA, userB], db);
    assert.equal(result[userA].profilePhotoId, 'player-profile-기사');
    assert.equal(result[userB].profilePhotoId, 'player-profile-드워프');
});
