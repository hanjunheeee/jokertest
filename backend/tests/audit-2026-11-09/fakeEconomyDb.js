'use strict';

// 시험용 가짜 경제 DB, 진짜 DB 없이 경제·업적 서비스를 끝까지 돌리게 함
// 지갑·장부·보유·장착·구매 요청·이모티콘 팔레트·재화 상품·업적 지급 행 + 트랜잭션 되돌리기·행 잠금
// 장부·구매 요청 참조 id는 DB 칸 크기(150자)를 넘으면 진짜 MySQL처럼 실패하게 함

const REFERENCE_COLUMN_MAX = 150;

// 진짜 MySQL "Data too long" 흉내
const dataTooLong = (column) => {
    const error = new Error(`Data too long for column '${column}'`);
    error.name = 'SequelizeDatabaseError';
    error.parent = { code: 'ER_DATA_TOO_LONG' };
    return error;
};

const uniqueError = (message) => {
    const error = new Error(message);
    error.name = 'SequelizeUniqueConstraintError';
    return error;
};

// 같은 키를 한 트랜잭션만 잡게 하는 잠금 (같은 트랜잭션은 다시 잡아도 통과)
const createLockTable = () => {
    const tails = new Map();
    const holders = new Map();
    return (key, transaction) => {
        if (holders.get(key) === transaction) return Promise.resolve(() => {});
        const tail = tails.get(key) ?? Promise.resolve();
        let release;
        const held = new Promise((resolve) => { release = resolve; });
        tails.set(key, tail.then(() => held));
        return tail.then(() => {
            holders.set(key, transaction);
            return () => { holders.delete(key); release(); };
        });
    };
};

const createFakeEconomyDb = ({ products = [] } = {}) => {
    const wallets = new Map();
    const ledgerEntries = [];
    const entitlements = [];
    const loadouts = new Map();
    const purchaseRequests = [];
    const palettes = new Map();
    const achievementGrants = [];
    const productRows = new Map(products.map((row) => [row.product_id, { ...row }]));
    const ids = { ledger: 1, entitlement: 1, request: 1, grant: 1 };
    const lockWalletKey = createLockTable();
    const lockLoadoutKey = createLockTable();
    const lockPaletteKey = createLockTable();
    const hooks = { failTransactions: [] };

    const onUndo = (options, fn) => {
        if (options?.transaction?._undo) options.transaction._undo.push(fn);
    };
    const removeFrom = (list, record) => () => {
        const index = list.indexOf(record);
        if (index !== -1) list.splice(index, 1);
    };
    const lockIfAsked = async (lockTable, key, { transaction, lock } = {}) => {
        if (lock && transaction) {
            const release = await lockTable(key, transaction);
            transaction._releasers.push(release);
        }
    };

    const EconomyWallet = {
        async create(row, options = {}) {
            if (wallets.has(row.user_id)) throw uniqueError('duplicate wallet');
            const record = {
                ...row,
                async update(patch, updateOptions = {}) {
                    const before = { balance_gold: record.balance_gold, balance_diamond: record.balance_diamond };
                    onUndo(updateOptions, () => Object.assign(record, before));
                    Object.assign(record, patch);
                    return record;
                },
            };
            wallets.set(row.user_id, record);
            onUndo(options, () => wallets.delete(row.user_id));
            return record;
        },
        async findOne(options) {
            const record = wallets.get(options.where.user_id);
            if (!record) return null;
            await lockIfAsked(lockWalletKey, options.where.user_id, options);
            return record;
        },
    };

    const EconomyLedgerEntry = {
        async create(row, options = {}) {
            if (typeof row.reference_event_id === 'string' && row.reference_event_id.length > REFERENCE_COLUMN_MAX) {
                throw dataTooLong('reference_event_id');
            }
            if (ledgerEntries.some((e) => e.user_id === row.user_id && e.reference_event_id === row.reference_event_id)) {
                throw uniqueError('duplicate ledger reference');
            }
            const record = { id: ids.ledger++, ...row, created_at: new Date('2026-11-09T00:00:00Z') };
            ledgerEntries.push(record);
            onUndo(options, removeFrom(ledgerEntries, record));
            return record;
        },
        async findOne({ where }) {
            return ledgerEntries.find((e) => e.user_id === where.user_id && e.reference_event_id === where.reference_event_id) ?? null;
        },
        async findAll({ where, limit }) {
            const rows = ledgerEntries.filter((e) => e.user_id === where.user_id).slice().sort((a, b) => b.id - a.id);
            return typeof limit === 'number' ? rows.slice(0, limit) : rows;
        },
    };

    const EconomyEntitlement = {
        async create(row, options = {}) {
            if (entitlements.some((e) => e.user_id === row.user_id && e.item_id === row.item_id)) {
                throw uniqueError('duplicate entitlement');
            }
            const record = { id: ids.entitlement++, ...row, acquired_at: new Date('2026-11-09T00:00:00Z') };
            entitlements.push(record);
            onUndo(options, removeFrom(entitlements, record));
            return record;
        },
        async findOne({ where }) {
            return entitlements.find((e) => e.user_id === where.user_id && e.item_id === where.item_id) ?? null;
        },
        async findAll({ where }) {
            return entitlements
                .filter((e) => e.user_id === where.user_id && (where.item_type === undefined || e.item_type === where.item_type))
                .sort((a, b) => a.id - b.id);
        },
    };

    // 장착 행은 읽을 때마다 복사본 (진짜 DB처럼 읽은 뒤 바뀐 값은 안 보임)
    const loadoutSnapshot = (stored) => {
        const snapshot = {
            ...stored,
            async update(patch, options = {}) {
                const before = { ...stored };
                onUndo(options, () => { Object.keys(stored).forEach((k) => delete stored[k]); Object.assign(stored, before); });
                Object.assign(stored, patch);
                Object.assign(snapshot, patch);
                return snapshot;
            },
        };
        return snapshot;
    };
    const EconomyLoadout = {
        async findOrCreate({ where, defaults }) {
            const existing = loadouts.get(where.user_id);
            if (existing) return [loadoutSnapshot(existing), false];
            const stored = {
                user_id: where.user_id,
                selected_profile_photo_id: null,
                selected_profile_border_id: null,
                selected_card_frame_id: null,
                selected_skin_noble: null,
                selected_skin_clown: null,
                selected_skin_guard: null,
                selected_skin_doctor: null,
                selected_skin_witch_hunter: null,
                ...defaults,
            };
            loadouts.set(where.user_id, stored);
            return [loadoutSnapshot(stored), true];
        },
        async findOne(options) {
            const stored = loadouts.get(options.where.user_id);
            if (!stored) return null;
            await lockIfAsked(lockLoadoutKey, options.where.user_id, options);
            return loadoutSnapshot(stored);
        },
        async findAll({ where }) {
            const userIds = Array.isArray(where.user_id) ? where.user_id : [where.user_id];
            return userIds.map((id) => loadouts.get(id)).filter(Boolean).map(loadoutSnapshot);
        },
        async update(patch, { where }) {
            const stored = loadouts.get(where.user_id);
            if (!stored) return [0];
            const matches = Object.entries(where).every(([key, expected]) => stored[key] === expected);
            if (!matches) return [0];
            Object.assign(stored, patch);
            return [1];
        },
    };

    const EconomyPurchaseRequest = {
        async create(row, options = {}) {
            if (typeof row.reference_event_id === 'string' && row.reference_event_id.length > REFERENCE_COLUMN_MAX) {
                throw dataTooLong('reference_event_id');
            }
            if (purchaseRequests.some((r) => r.user_id === row.user_id && r.reference_event_id === row.reference_event_id)) {
                throw uniqueError('duplicate purchase request');
            }
            const record = { id: ids.request++, ...row, created_at: new Date('2026-11-09T00:00:00Z') };
            purchaseRequests.push(record);
            onUndo(options, removeFrom(purchaseRequests, record));
            return record;
        },
        async findOne({ where }) {
            return purchaseRequests.find((r) => r.user_id === where.user_id && r.reference_event_id === where.reference_event_id) ?? null;
        },
    };

    const EconomyEmojiPalette = {
        async findOrCreate({ where, defaults }) {
            const existing = palettes.get(where.user_id);
            if (existing) return [{ ...existing }, false];
            const stored = { ...defaults };
            palettes.set(where.user_id, stored);
            return [{ ...stored }, true];
        },
        async update(patch, { where, transaction }) {
            const stored = palettes.get(where.user_id);
            if (!stored || stored.revision !== where.revision) return [0];
            const before = { ...stored };
            onUndo({ transaction }, () => Object.assign(stored, before));
            Object.assign(stored, patch);
            return [1];
        },
        async findOne(options) {
            const stored = palettes.get(options.where.user_id);
            if (!stored) return null;
            await lockIfAsked(lockPaletteKey, options.where.user_id, options);
            return { ...stored };
        },
    };

    const EconomyCurrencyProduct = {
        async findOne({ where }) {
            const row = productRows.get(where.product_id);
            return row ? { ...row } : null;
        },
        async findAll({ where }) {
            return [...productRows.values()].filter((row) => row.status === where.status && (!where.kind || row.kind === where.kind));
        },
    };

    const AchievementGrant = {
        async findOrCreate({ where, defaults, transaction }) {
            const existing = achievementGrants.find((g) => g.user_id === where.user_id && g.achievement_id === where.achievement_id);
            if (existing) return [existing, false];
            const record = { id: ids.grant++, ...defaults };
            achievementGrants.push(record);
            onUndo({ transaction }, removeFrom(achievementGrants, record));
            return [record, true];
        },
        async findAll({ where }) {
            return achievementGrants.filter((g) => g.user_id === where.user_id)
                .map((g) => ({ achievement_id: g.achievement_id, granted_at: g.granted_at }));
        },
    };

    // (fn) 또는 (options, fn) 둘 다 받음, 실패하면 거꾸로 되돌리고 잠금 풂
    const transaction = async (optionsOrFn, maybeFn) => {
        const fn = typeof optionsOrFn === 'function' ? optionsOrFn : maybeFn;
        const t = { LOCK: { UPDATE: 'UPDATE' }, _releasers: [], _undo: [] };
        try {
            const result = await fn(t);
            const injected = hooks.failTransactions.shift();
            if (injected) throw injected;
            return result;
        } catch (error) {
            for (const undo of t._undo.slice().reverse()) undo();
            throw error;
        } finally {
            for (const release of t._releasers) release();
        }
    };

    class UniqueConstraintError extends Error {}

    return {
        sequelize: {
            models: {
                EconomyWallet, EconomyEntitlement, EconomyLoadout, EconomyPurchaseRequest, EconomyEmojiPalette, EconomyCurrencyProduct,
            },
            transaction,
        },
        Sequelize: { UniqueConstraintError },
        EconomyLedgerEntry,
        EconomyCurrencyProduct,
        AchievementGrant,
        _inspect: { wallets, ledgerEntries, entitlements, loadouts, purchaseRequests, palettes, achievementGrants, productRows },
        // 다음 트랜잭션 몇 개를 커밋 직전에 이 오류로 실패시킴 (데드락 흉내)
        _failNextTransactions: (...errors) => { hooks.failTransactions.push(...errors); },
    };
};

// 지갑 잔액 바로 넣기 (시험 준비용, 장부 안 남김)
const seedWallet = (db, userId, { gold = 0, diamond = 0 } = {}) => {
    const existing = db._inspect.wallets.get(userId);
    if (existing) {
        existing.balance_gold = gold;
        existing.balance_diamond = diamond;
        return existing;
    }
    const record = {
        user_id: userId,
        balance_gold: gold,
        balance_diamond: diamond,
        async update(patch, options = {}) {
            const before = { balance_gold: record.balance_gold, balance_diamond: record.balance_diamond };
            if (options?.transaction?._undo) options.transaction._undo.push(() => Object.assign(record, before));
            Object.assign(record, patch);
            return record;
        },
    };
    db._inspect.wallets.set(userId, record);
    return record;
};

// 골드 구매 상품 행 (DB 칸 이름 그대로)
const goldProductRow = (overrides = {}) => ({
    product_id: 'gold-100',
    kind: 'GOLD_PURCHASE',
    display_name: '골드 100',
    pay_currency: 'DIAMOND',
    pay_amount: 10,
    grant_currency: 'GOLD',
    grant_amount: 100,
    bonus_amount: 0,
    status: 'ON_SALE',
    sort_order: 1,
    version: 1,
    ...overrides,
});

const deadlockError = () => {
    const error = new Error('Deadlock found when trying to get lock');
    error.name = 'SequelizeDatabaseError';
    error.parent = { code: 'ER_LOCK_DEADLOCK' };
    return error;
};

module.exports = {
    REFERENCE_COLUMN_MAX,
    createFakeEconomyDb,
    seedWallet,
    goldProductRow,
    deadlockError,
};
