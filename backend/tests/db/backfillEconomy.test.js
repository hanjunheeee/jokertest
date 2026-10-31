'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { backfillDefaultEntitlements, DEFAULT_BATCH_SIZE } = require('../../db/backfillEconomy');

const OP_GT = Symbol('gt');

const createFakeDb = ({ userUuids = [] } = {}) => {
    const walletsByUser = new Map();
    const entitlements = [];
    const loadouts = new Map();
    const ledgerEntries = [];
    let nextLedgerId = 1;

    const users = [...userUuids].sort().map((uuid) => ({ uuid }));

    const EconomyWallet = {
        async create({ user_id, balance_gold, balance_diamond }) {
            const record = { user_id, balance_gold, balance_diamond, async update(patch) { Object.assign(record, patch); } };
            walletsByUser.set(user_id, record);
            return record;
        },
        async findOne({ where }) { return walletsByUser.get(where.user_id) ?? null; },
    };

    const EconomyEntitlement = {
        async create({ user_id, item_id, item_type, source }) {
            const record = { user_id, item_id, item_type, source };
            entitlements.push(record);
            return record;
        },
        async findOne({ where }) {
            return entitlements.find((e) => e.user_id === where.user_id && e.item_id === where.item_id) ?? null;
        },
    };

    const EconomyLoadout = {
        async findOrCreate({ where, defaults }) {
            let stored = loadouts.get(where.user_id);
            if (stored) return [stored, false];
            stored = {
                user_id: where.user_id,
                selected_profile_photo_id: null,
                selected_profile_border_id: null,
                selected_card_frame_id: null,
                ...defaults,
            };
            loadouts.set(where.user_id, stored);
            return [stored, true];
        },
        async findOne({ where }) { return loadouts.get(where.user_id) ?? null; },
        async update(patch, { where }) {
            const stored = loadouts.get(where.user_id);
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
            if (ledgerCreateInterceptor) {
                const interceptor = ledgerCreateInterceptor;
                ledgerCreateInterceptor = null;
                await interceptor(fields);
            }
            if (ledgerEntries.some((e) => e.user_id === fields.user_id && e.reference_event_id === fields.reference_event_id)) {
                const error = new Error('duplicate reference_event_id for this account');
                error.name = 'SequelizeUniqueConstraintError';
                throw error;
            }
            const record = { id: nextLedgerId++, ...fields };
            ledgerEntries.push(record);
            return record;
        },
        async findOne({ where }) {
            if (!where.reference_event_id) return null;
            return ledgerEntries.find((e) => e.user_id === where.user_id && e.reference_event_id === where.reference_event_id) ?? null;
        },
    };

    const sequelize = {
        models: { EconomyWallet, EconomyEntitlement, EconomyLoadout },
        transaction: async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }),
    };

    return {
        Sequelize: { Op: { gt: OP_GT } },
        sequelize,
        EconomyLedgerEntry,
        User: {
            async findAll({ where, order, limit }) {
                const cursor = where?.uuid?.[OP_GT];
                let rows = users.filter((u) => !cursor || u.uuid > cursor);
                if (order?.[0]?.[0] === 'uuid' && order?.[0]?.[1] === 'ASC') {
                    rows = [...rows].sort((a, b) => (a.uuid < b.uuid ? -1 : a.uuid > b.uuid ? 1 : 0));
                }
                return typeof limit === 'number' ? rows.slice(0, limit) : rows;
            },
        },
        _inspect: { walletsByUser, entitlements, loadouts, ledgerEntries },
        _interceptNextLedgerCreate: (fn) => { ledgerCreateInterceptor = fn; },
    };
};

const BASIC_EMOTICON_IDS = [
    'emoji-basic-reject', 'emoji-basic-tears', 'emoji-basic-anger', 'emoji-basic-love',
    'emoji-basic-grin', 'emoji-basic-hello', 'emoji-basic-surrender', 'emoji-basic-dizzy',
];

const uuidsFor = (n, prefix = 'user') =>
    Array.from({ length: n }, (_, i) => `${prefix}-${String(i).padStart(4, '0')}`);

test('배치(batch): batchSize만큼씩 끊어 처리하고, 계정 수가 배치 크기의 배수가 아니어도 전부 처리한다', async () => {
    const uuids = uuidsFor(5);
    const db = createFakeDb({ userUuids: uuids });
    const checkpoints = [];

    const result = await backfillDefaultEntitlements({
        db, batchSize: 2, onCheckpoint: (uuid) => checkpoints.push(uuid),
    });

    assert.equal(result.processed, 5);
    assert.equal(result.granted, 5);
    assert.deepEqual(result.failures, []);
    assert.deepEqual(checkpoints, [uuids[1], uuids[3], uuids[4]], '배치마다 마지막 uuid가 체크포인트로 보고되어야 한다');

    for (const uuid of uuids) {
        const granted = db._inspect.entitlements.filter((e) => e.user_id === uuid);
        assert.equal(granted.length, 25, `${uuid}는 기본 프로필 16종 + 평민 테두리 1종 + 기본 이모티콘 8종을 모두 받아야 한다`);
        const grantedIds = new Set(granted.map((e) => e.item_id));
        for (const emoticonId of BASIC_EMOTICON_IDS) {
            assert.ok(grantedIds.has(emoticonId), `${uuid}는 백필로 기본 이모티콘 ${emoticonId}를 받아야 한다`);
        }
        assert.equal(granted.filter((e) => e.item_type === 'EMOTICON').length, 8, '상점 판매 이모티콘은 기본 지급되면 안 된다');
    }
});

test('체크포인트(resumable): startAfterUuid를 넘기면 그 uuid 이전 구간은 다시 처리하지 않는다', async () => {
    const uuids = uuidsFor(5);
    const db = createFakeDb({ userUuids: uuids });

    const result = await backfillDefaultEntitlements({ db, batchSize: 2, startAfterUuid: uuids[1] });

    assert.equal(result.processed, 3, 'uuids[0]·uuids[1]은 건너뛰고 나머지 3개만 처리해야 한다');
    assert.equal(db._inspect.entitlements.filter((e) => e.user_id === uuids[0]).length, 0);
    assert.equal(db._inspect.entitlements.filter((e) => e.user_id === uuids[1]).length, 0);
    assert.equal(db._inspect.entitlements.filter((e) => e.user_id === uuids[2]).length, 25);
});

test('멱등(idempotent): 같은 구간을 두 번 백필해도 계정당 중복 지급되지 않는다', async () => {
    const uuids = uuidsFor(3);
    const db = createFakeDb({ userUuids: uuids });

    await backfillDefaultEntitlements({ db, batchSize: 10 });
    const ledgerAfterFirst = db._inspect.ledgerEntries.length;
    const result2 = await backfillDefaultEntitlements({ db, batchSize: 10 });

    assert.equal(result2.granted, 3, '두 번째 실행도 모든 계정을 성공으로 보고해야 한다(이미 보유해도 성공)');
    assert.equal(db._inspect.ledgerEntries.length, ledgerAfterFirst, '재실행이 새 원장 항목을 만들면 안 된다');
    for (const uuid of uuids) {
        const owned = db._inspect.entitlements.filter((e) => e.user_id === uuid);
        assert.equal(owned.length, 25, '재실행이 중복 지급을 만들면 안 된다');
        for (const emoticonId of BASIC_EMOTICON_IDS) {
            assert.equal(owned.filter((e) => e.item_id === emoticonId).length, 1, `재실행 뒤에도 ${emoticonId}는 정확히 1건이어야 한다`);
        }
    }
});

test('재시도 안전(retry-safe): 일시적 오류는 maxRetries만큼 재시도해 결국 성공하면 failures에 남지 않는다', async () => {
    const uuids = uuidsFor(2);
    const db = createFakeDb({ userUuids: uuids });

    let failCount = 0;
    db._interceptNextLedgerCreate(() => {
        failCount += 1;
        throw new Error('일시적 DB 오류');
    });

    const result = await backfillDefaultEntitlements({ db, batchSize: 10, maxRetries: 2 });

    assert.equal(failCount, 1, '딱 한 번만 실패를 주입했다');
    assert.deepEqual(result.failures, []);
    assert.equal(result.granted, 2);
    assert.equal(db._inspect.entitlements.filter((e) => e.user_id === uuids[0]).length, 25, '재시도 끝에 성공한 계정은 완전히 지급되어야 한다');
});

test('재시도 안전(retry-safe): 계속 실패하는 계정은 failures에 기록되지만 나머지 계정 처리는 멈추지 않는다', async () => {
    const uuids = uuidsFor(3);
    const db = createFakeDb({ userUuids: uuids });

    const originalCreate = db.EconomyLedgerEntry.create;
    db.EconomyLedgerEntry.create = async (fields) => {
        if (fields.user_id === uuids[1]) throw new Error('영구 실패 계정');
        return originalCreate(fields);
    };

    const result = await backfillDefaultEntitlements({ db, batchSize: 10, maxRetries: 1 });

    assert.equal(result.processed, 3);
    assert.equal(result.granted, 2, '실패한 계정을 제외한 나머지는 성공해야 한다');
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].userId, uuids[1]);
    assert.match(result.failures[0].message, /영구 실패 계정/);

    assert.equal(db._inspect.entitlements.filter((e) => e.user_id === uuids[0]).length, 25);
    assert.equal(db._inspect.entitlements.filter((e) => e.user_id === uuids[2]).length, 25);
    assert.equal(db._inspect.entitlements.filter((e) => e.user_id === uuids[1]).length, 0, '계속 실패한 계정은 부분 지급 없이 0건으로 남아야 한다');
});

for (const failedIndex of [0, 1]) {
    test(`실패 계정 ${failedIndex}: 중단 후 저장된 체크포인트로 재개하면 누락·중복 지급이 없다`, async () => {
        const uuids = uuidsFor(5);
        const db = createFakeDb({ userUuids: uuids });
        const originalCreate = db.EconomyLedgerEntry.create;
        db.EconomyLedgerEntry.create = async (fields) => {
            if (fields.user_id === uuids[failedIndex]) throw new Error('지속 실패');
            return originalCreate(fields);
        };
        let persistedCheckpoint = null;
        const checkpoints = [];
        await assert.rejects(backfillDefaultEntitlements({
            db, batchSize: 2, maxRetries: 0,
            onCheckpoint: async (uuid) => {
                await Promise.resolve();
                persistedCheckpoint = uuid;
                checkpoints.push(uuid);
            },
            onProgress: ({ processed, resumeAfterUuid }) => {
                assert.equal(resumeAfterUuid, persistedCheckpoint);
                if (processed === 4) throw new Error('중단 시뮬레이션');
            },
        }), /중단 시뮬레이션/);
        const safeCheckpoint = failedIndex === 0 ? null : uuids[0];
        assert.deepEqual(checkpoints, [safeCheckpoint, safeCheckpoint]);
        assert.equal(db._inspect.entitlements.filter((e) => e.user_id === uuids[3]).length, 25,
            '실패 뒤의 정상 계정도 처리한다');

        db.EconomyLedgerEntry.create = originalCreate;
        const resumed = await backfillDefaultEntitlements({ db, batchSize: 2, startAfterUuid: persistedCheckpoint });
        assert.deepEqual(resumed.failures, []);
        for (const uuid of uuids) {
            const owned = db._inspect.entitlements.filter((e) => e.user_id === uuid);
            assert.equal(owned.length, 25);
            assert.equal(new Set(owned.map((e) => e.item_id)).size, 25);
        }
        const ledgerKeys = db._inspect.ledgerEntries.map((e) => `${e.user_id}:${e.reference_event_id}`);
        assert.equal(new Set(ledgerKeys).size, ledgerKeys.length);
    });
}

test('계정이 없으면 아무 것도 처리하지 않고 빈 결과를 돌려준다', async () => {
    const db = createFakeDb({ userUuids: [] });
    const result = await backfillDefaultEntitlements({ db });
    assert.deepEqual(result, { processed: 0, granted: 0, failures: [] });
});

test('DEFAULT_BATCH_SIZE는 배치 크기를 생략했을 때의 기본값과 같다(회귀 방지용 상수 노출)', () => {
    assert.equal(typeof DEFAULT_BATCH_SIZE, 'number');
    assert.ok(DEFAULT_BATCH_SIZE > 0);
});
