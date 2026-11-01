'use strict';

// 경제 카테고리 입구, 옛 economy.service 이름 전부 내보냄 (나누는 중이라 남은 함수도 여기)
// routes·컨트롤러·친구·업적·인증·충전·socket이 이 입구로 부름
const crypto = require('crypto');
const catalog = require('../../economy/catalog');
const { createError } = require('../../utils/appError');
const {
    ITEM_TYPES,
    DEFAULT_PROFILE_PHOTO_ID,
    DEFAULT_PROFILE_BORDER_ID,
    listDefaultGrantItems,
} = catalog;
const { isValidCurrency, isBoundedAmount, payloadMatches, referenceEventConflictError, defaultDb, buildSkinsByJob, purchasePayloadsEqual, purchaseRequestConflictError, snapshotLedgerEntry, isFreeJobSkin } = require('./helpers');
const { CURRENCY_TO_WALLET_COLUMN, MAX_BALANCE, CURRENCIES, GOLD_PURCHASE_REASON, GOLD_PURCHASE_KIND, GOLD_PURCHASE_MAX_ATTEMPTS, SLOT_TO_ITEM_TYPE, SLOT_TO_LOADOUT_COLUMN, FREE_CARD_FRAME_ID, JOB_SKIN_ID_PREFIX_BY_SLOT, SKIN_ITEM_ID_PREFIX, EMOJI_PALETTE_SLOT_COLUMNS, DEFAULT_EMOJI_PALETTE_SLOTS } = require('./constants');

const economyModels = (db) => ({
    sequelize: db.sequelize,
    EconomyWallet: db.sequelize.models.EconomyWallet,
    EconomyLedgerEntry: db.EconomyLedgerEntry,
    EconomyEntitlement: db.sequelize.models.EconomyEntitlement,
    EconomyLoadout: db.sequelize.models.EconomyLoadout,
    EconomyPurchaseRequest: db.sequelize.models.EconomyPurchaseRequest,
    EconomyEmojiPalette: db.sequelize.models.EconomyEmojiPalette,
});

const ensureWalletRow = async (db, userId, externalTransaction = null) => {
    const models = economyModels(db);
    try {
        await models.EconomyWallet.create(
            { user_id: userId, balance_gold: 0, balance_diamond: 0 },
            externalTransaction ? { transaction: externalTransaction } : undefined,
        );
    } catch (error) {
        if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
    }
};

const applyLedgerTransaction = async (db, {
    userId, reason, currency, amount, itemId = null, itemType = null, referenceEventId, entitlementSource = null,
}, { transaction: externalTransaction = null } = {}) => {
    if (typeof referenceEventId !== 'string' || referenceEventId.length === 0) {
        throw createError('참조 사건 ID(referenceEventId)가 필요합니다.', 400, 'MISSING_REFERENCE_EVENT_ID');
    }
    if (!isValidCurrency(currency)) {
        throw createError('알 수 없는 재화입니다.', 400, 'INVALID_CURRENCY');
    }
    if (!isBoundedAmount(amount)) {
        throw createError('금액이 허용 범위를 벗어난 정수여야 합니다.', 400, 'AMOUNT_OUT_OF_RANGE');
    }

    const models = economyModels(db);
    const payload = { reason, itemId, currency, amount };

    const preExisting = await models.EconomyLedgerEntry.findOne({
        where: { user_id: userId, reference_event_id: referenceEventId },
        ...(externalTransaction ? { transaction: externalTransaction } : {}),
    });
    if (preExisting) {
        if (!payloadMatches(preExisting, payload)) throw referenceEventConflictError();
        return { idempotent: true, ledgerEntry: preExisting };
    }

    await ensureWalletRow(db, userId, externalTransaction);

    const runWrite = async (t) => {
        const wallet = await models.EconomyWallet.findOne({
            where: { user_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        const committed = await models.EconomyLedgerEntry.findOne({
            where: { user_id: userId, reference_event_id: referenceEventId },
            transaction: t,
        });
        if (committed) {
            if (!payloadMatches(committed, payload)) throw referenceEventConflictError();
            return { idempotent: true, ledgerEntry: committed };
        }

        if (itemId) {
            const owned = await models.EconomyEntitlement.findOne({
                where: { user_id: userId, item_id: itemId },
                transaction: t,
            });
            if (owned) {
                throw createError('이미 보유한 상품입니다.', 409, 'ITEM_ALREADY_OWNED');
            }
        }

        const column = CURRENCY_TO_WALLET_COLUMN[currency];
        const newBalance = wallet[column] + amount;
        if (newBalance < 0) {
            throw createError('잔액이 부족합니다.', 400, 'INSUFFICIENT_BALANCE');
        }
        if (newBalance > MAX_BALANCE) {
            throw createError('잔액 한도를 초과했습니다.', 400, 'BALANCE_LIMIT_EXCEEDED');
        }

        await wallet.update({ [column]: newBalance }, { transaction: t });

        let ledgerEntry;
        try {
            ledgerEntry = await models.EconomyLedgerEntry.create({
                user_id: userId,
                reason,
                item_id: itemId,
                currency,
                amount,
                balance_after: newBalance,
                reference_event_id: referenceEventId,
            }, { transaction: t });
        } catch (error) {
            if (error?.name === 'SequelizeUniqueConstraintError') {
                throw Object.assign(
                    createError('이미 처리된 참조 사건입니다.', 409, 'DUPLICATE_REFERENCE_EVENT'),
                    { referenceEventId },
                );
            }
            throw error;
        }

        if (itemId) {
            await models.EconomyEntitlement.create({
                user_id: userId,
                item_id: itemId,
                item_type: itemType,
                source: entitlementSource,
            }, { transaction: t });
        }

        return { idempotent: false, ledgerEntry, walletBalance: newBalance };
    };

    const resolveDuplicate = async (transactionForLookup) => {
        const existing = await models.EconomyLedgerEntry.findOne({
            where: { user_id: userId, reference_event_id: referenceEventId },
            ...(transactionForLookup ? { transaction: transactionForLookup } : {}),
        });
        if (!existing) return null;
        if (!payloadMatches(existing, payload)) throw referenceEventConflictError();
        return { idempotent: true, ledgerEntry: existing };
    };

    if (externalTransaction) {
        try {
            return await runWrite(externalTransaction);
        } catch (error) {
            if (error?.code === 'DUPLICATE_REFERENCE_EVENT') {
                const resolved = await resolveDuplicate(externalTransaction);
                if (resolved) return resolved;
            }
            throw error;
        }
    }

    try {
        return await models.sequelize.transaction(runWrite);
    } catch (error) {
        if (error?.code === 'DUPLICATE_REFERENCE_EVENT') {
            const resolved = await resolveDuplicate(null);
            if (resolved) return resolved;
        }
        throw error;
    }
};

const ensureDefaultLoadout = async (db, userId, externalTransaction = null) => {
    const models = economyModels(db);
    const txOptions = externalTransaction ? { transaction: externalTransaction } : {};

    await models.EconomyLoadout.findOrCreate({
        where: { user_id: userId },
        defaults: { user_id: userId, revision: crypto.randomUUID() },
        ...txOptions,
    });

    await models.EconomyLoadout.update(
        { selected_profile_photo_id: DEFAULT_PROFILE_PHOTO_ID, revision: crypto.randomUUID() },
        { where: { user_id: userId, selected_profile_photo_id: null }, ...txOptions },
    );
    await models.EconomyLoadout.update(
        { selected_profile_border_id: DEFAULT_PROFILE_BORDER_ID, revision: crypto.randomUUID() },
        { where: { user_id: userId, selected_profile_border_id: null }, ...txOptions },
    );

    return models.EconomyLoadout.findOne({ where: { user_id: userId }, ...txOptions });
};

const ensureDefaultEntitlements = async (userId, db = defaultDb(), { transaction: externalTransaction = null } = {}) => {
    for (const item of listDefaultGrantItems()) {
        const referenceEventId = `default-grant:${userId}:${item.id}`;
        try {
            await applyLedgerTransaction(db, {
                userId,
                reason: 'DEFAULT_GRANT',
                currency: CURRENCIES.GOLD,
                amount: 0,
                itemId: item.id,
                itemType: item.type,
                referenceEventId,
                entitlementSource: 'DEFAULT_GRANT',
            }, { transaction: externalTransaction });
        } catch (error) {
            if (error?.code === 'ITEM_ALREADY_OWNED') continue;
            throw error;
        }
    }
    return ensureDefaultLoadout(db, userId, externalTransaction);
};

const getWalletSummary = async (userId, db = defaultDb()) => {
    await ensureDefaultEntitlements(userId, db);
    const models = economyModels(db);

    const [wallet, entitlements, loadout] = await Promise.all([
        models.EconomyWallet.findOne({ where: { user_id: userId } }),
        models.EconomyEntitlement.findAll({ where: { user_id: userId }, order: [['id', 'ASC']] }),
        models.EconomyLoadout.findOne({ where: { user_id: userId } }),
    ]);

    return {
        balanceGold: wallet ? wallet.balance_gold : 0,
        balanceDiamond: wallet ? wallet.balance_diamond : 0,
        entitlements: entitlements.map((row) => ({
            itemId: row.item_id,
            itemType: row.item_type,
            source: row.source,
            acquiredAt: row.acquired_at,
        })),
        loadout: {
            selectedProfilePhotoId: loadout?.selected_profile_photo_id ?? null,
            selectedProfileBorderId: loadout?.selected_profile_border_id ?? null,
            selectedCardFrameId: loadout?.selected_card_frame_id ?? null,
            selectedSkinsByJob: buildSkinsByJob(loadout),
            revision: loadout?.revision ?? null,
        },
    };
};

const listTransactions = async (userId, { limit = 50 } = {}, db = defaultDb()) => {
    const models = economyModels(db);
    const rows = await models.EconomyLedgerEntry.findAll({
        where: { user_id: userId },
        order: [['id', 'DESC']],
        limit,
    });
    return rows.map((row) => ({
        id: row.id,
        reason: row.reason,
        itemId: row.item_id,
        currency: row.currency,
        amount: row.amount,
        balanceAfter: row.balance_after,
        referenceEventId: row.reference_event_id,
        createdAt: row.created_at,
    }));
};

const derivePurchaseItemReferenceEventId = (referenceEventId, itemId) => `${referenceEventId}::item::${itemId}`;

const normalizePurchaseRequestPayload = (items) => ({ itemIds: items.map((entry) => entry.itemId).slice().sort() });

const purchaseItems = async ({ userId, items, referenceEventId }, db = defaultDb()) => {
    if (typeof referenceEventId !== 'string' || referenceEventId.length === 0) {
        throw createError('참조 사건 ID(referenceEventId)가 필요합니다.', 400, 'MISSING_REFERENCE_EVENT_ID');
    }
    if (!Array.isArray(items) || items.length === 0) {
        throw createError('구매할 상품 목록이 비어 있습니다.', 400, 'EMPTY_PURCHASE_ITEMS');
    }
    const itemIds = items.map((entry) => entry?.itemId);
    if (itemIds.some((id) => typeof id !== 'string' || id.length === 0)) {
        throw createError('itemId가 필요합니다.', 400, 'INVALID_PURCHASE_ITEM');
    }
    if (new Set(itemIds).size !== itemIds.length) {
        throw createError('같은 상품을 중복으로 요청할 수 없습니다.', 400, 'DUPLICATE_PURCHASE_ITEM');
    }

    const kind = items.length > 1 ? 'BULK' : 'SINGLE';
    const payload = normalizePurchaseRequestPayload(items);
    const models = economyModels(db);

    const preExisting = await models.EconomyPurchaseRequest.findOne({ where: { user_id: userId, reference_event_id: referenceEventId } });
    if (preExisting) {
        if (!purchasePayloadsEqual(preExisting.payload_json, payload)) throw purchaseRequestConflictError();
        return { idempotent: true, kind: preExisting.kind, results: preExisting.result_json };
    }

    const resolvedItems = itemIds.map((itemId) => {
        const catalogItem = catalog.getCatalogItem(itemId);
        if (!catalogItem || catalogItem.purchasable !== true) {
            throw createError(`존재하지 않거나 구매할 수 없는 상품입니다: ${itemId}`, 400, 'ITEM_NOT_PURCHASABLE');
        }
        return catalogItem;
    });

    await ensureWalletRow(db, userId);

    const runWrite = async (t) => {
        await models.EconomyWallet.findOne({ where: { user_id: userId }, transaction: t, lock: t.LOCK.UPDATE });

        const committed = await models.EconomyPurchaseRequest.findOne({
            where: { user_id: userId, reference_event_id: referenceEventId },
            transaction: t,
        });
        if (committed) {
            if (!purchasePayloadsEqual(committed.payload_json, payload)) throw purchaseRequestConflictError();
            return { idempotent: true, kind: committed.kind, results: committed.result_json };
        }

        const results = [];
        for (const catalogItem of resolvedItems) {
            // eslint-disable-next-line no-await-in-loop -- 같은 외부 트랜잭션 t 위에서
            const outcome = await applyLedgerTransaction(db, {
                userId,
                reason: 'PURCHASE',
                currency: catalogItem.currency ?? CURRENCIES.GOLD,
                amount: -catalogItem.priceGold,
                itemId: catalogItem.id,
                itemType: catalogItem.type,
                referenceEventId: derivePurchaseItemReferenceEventId(referenceEventId, catalogItem.id),
                entitlementSource: 'PURCHASE',
            }, { transaction: t });
            results.push(snapshotLedgerEntry(outcome.ledgerEntry));
        }

        let purchaseRequest;
        try {
            purchaseRequest = await models.EconomyPurchaseRequest.create({
                user_id: userId,
                reference_event_id: referenceEventId,
                kind,
                payload_json: payload,
                result_json: results,
            }, { transaction: t });
        } catch (error) {
            if (error?.name === 'SequelizeUniqueConstraintError') {
                throw Object.assign(
                    createError('이미 처리된 참조 사건입니다.', 409, 'DUPLICATE_PURCHASE_REQUEST'),
                    { referenceEventId },
                );
            }
            throw error;
        }

        return { idempotent: false, kind, results, purchaseRequestId: purchaseRequest.id };
    };

    const resolveDuplicateRequest = async () => {
        const existing = await models.EconomyPurchaseRequest.findOne({ where: { user_id: userId, reference_event_id: referenceEventId } });
        if (!existing) return null;
        if (!purchasePayloadsEqual(existing.payload_json, payload)) throw purchaseRequestConflictError();
        return { idempotent: true, kind: existing.kind, results: existing.result_json };
    };

    try {
        return await models.sequelize.transaction(runWrite);
    } catch (error) {
        if (error?.code === 'DUPLICATE_PURCHASE_REQUEST') {
            const resolved = await resolveDuplicateRequest();
            if (resolved) return resolved;
        }
        throw error;
    }
};

const purchaseItem = async ({ userId, itemId, referenceEventId }, db = defaultDb()) => {
    const result = await purchaseItems({ userId, items: [{ itemId }], referenceEventId }, db);
    return { idempotent: result.idempotent, ledgerEntry: result.results[0] };
};

const getPurchaseResult = async (userId, referenceEventId, db = defaultDb()) => {
    if (typeof referenceEventId !== 'string' || referenceEventId.length === 0) {
        throw createError('참조 사건 ID(referenceEventId)가 필요합니다.', 400, 'MISSING_REFERENCE_EVENT_ID');
    }
    const models = economyModels(db);
    const existing = await models.EconomyPurchaseRequest.findOne({ where: { user_id: userId, reference_event_id: referenceEventId } });
    if (!existing) return null;
    return { kind: existing.kind, results: existing.result_json, createdAt: existing.created_at };
};

const deriveGoldPurchaseReferenceEventId = (referenceEventId, leg) =>
    `gold:${crypto.createHash('sha256').update(referenceEventId).digest('hex')}:${leg}`;

const isDeadlockError = (error) =>
    error?.parent?.code === 'ER_LOCK_DEADLOCK' || error?.original?.code === 'ER_LOCK_DEADLOCK';

const goldPurchaseResultOf = (stored) => {
    const [diamondEntry, goldEntry] = stored.result_json;
    return {
        idempotent: true,
        kind: stored.kind,
        results: stored.result_json,
        balanceDiamond: diamondEntry.balance_after,
        balanceGold: goldEntry.balance_after,
    };
};

const goldPurchaseInvalid = () => createError('골드 구매 요청 형식이 올바르지 않습니다.', 400, 'INVALID_GOLD_PURCHASE_REQUEST');

const purchaseGold = async ({ userId, productId, version, referenceEventId }, db = defaultDb()) => {
    if (typeof userId !== 'string' || userId.length === 0
        || typeof productId !== 'string' || productId.length === 0 || productId.length > 64
        || !Number.isSafeInteger(version) || version <= 0
        || typeof referenceEventId !== 'string' || referenceEventId.length === 0 || referenceEventId.length > 150) {
        throw goldPurchaseInvalid();
    }

    const models = economyModels(db);
    const payload = { type: GOLD_PURCHASE_REASON, productId, version };

    const consumeStored = (stored) => {
        const storedPayload = typeof stored.payload_json === 'string' ? JSON.parse(stored.payload_json) : stored.payload_json;
        if (stored.kind !== GOLD_PURCHASE_KIND
            || storedPayload?.type !== payload.type
            || storedPayload?.productId !== payload.productId
            || storedPayload?.version !== payload.version) {
            throw purchaseRequestConflictError();
        }
        return goldPurchaseResultOf(stored);
    };
    const findStored = (transaction) => models.EconomyPurchaseRequest.findOne({
        where: { user_id: userId, reference_event_id: referenceEventId },
        ...(transaction ? { transaction } : {}),
    });

    const preExisting = await findStored(null);
    if (preExisting) return consumeStored(preExisting);

    const currencyProductsService = require('./currencyProducts');

    const runOnce = () => models.sequelize.transaction({ isolationLevel: 'READ COMMITTED' }, async (t) => {
        let product = null;
        let productError = null;
        try {
            product = await currencyProductsService.getCurrencyProduct(
                { productId, version, kind: currencyProductsService.KINDS.GOLD_PURCHASE },
                db,
                { transaction: t },
            );
        } catch (error) {
            if (typeof error?.code === 'string' && error.code.startsWith('PRODUCT_')) productError = error;
            else throw error;
        }

        const lockWallet = () => models.EconomyWallet.findOne({
            where: { user_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        let wallet = await lockWallet();
        if (!wallet) {
            await ensureWalletRow(db, userId, t);
            wallet = await lockWallet();
        }

        const committed = await findStored(t);
        if (committed) return consumeStored(committed);
        if (productError) throw productError;

        const payAmount = product.payAmount;
        const grantTotal = product.grantAmount + product.bonusAmount;
        if (wallet.balance_diamond < payAmount) {
            throw createError('다이아 잔액이 부족합니다.', 400, 'INSUFFICIENT_DIAMOND');
        }

        const diamondOutcome = await applyLedgerTransaction(db, {
            userId,
            reason: GOLD_PURCHASE_REASON,
            currency: CURRENCIES.DIAMOND,
            amount: -payAmount,
            referenceEventId: deriveGoldPurchaseReferenceEventId(referenceEventId, 'diamond'),
        }, { transaction: t });
        const goldOutcome = await applyLedgerTransaction(db, {
            userId,
            reason: GOLD_PURCHASE_REASON,
            currency: CURRENCIES.GOLD,
            amount: grantTotal,
            referenceEventId: deriveGoldPurchaseReferenceEventId(referenceEventId, 'gold'),
        }, { transaction: t });
        if (diamondOutcome.idempotent || goldOutcome.idempotent) {
            throw createError('골드 구매 원장 상태가 일치하지 않습니다.', 500, 'GOLD_PURCHASE_LEDGER_INCONSISTENT');
        }

        const results = [snapshotLedgerEntry(diamondOutcome.ledgerEntry), snapshotLedgerEntry(goldOutcome.ledgerEntry)];
        try {
            await models.EconomyPurchaseRequest.create({
                user_id: userId,
                reference_event_id: referenceEventId,
                kind: GOLD_PURCHASE_KIND,
                payload_json: payload,
                result_json: results,
            }, { transaction: t });
        } catch (error) {
            if (error?.name === 'SequelizeUniqueConstraintError') {
                throw Object.assign(
                    createError('이미 처리된 참조 사건입니다.', 409, 'DUPLICATE_PURCHASE_REQUEST'),
                    { referenceEventId },
                );
            }
            throw error;
        }

        return {
            idempotent: false,
            kind: GOLD_PURCHASE_KIND,
            results,
            balanceDiamond: diamondOutcome.walletBalance,
            balanceGold: goldOutcome.walletBalance,
        };
    });

    for (let attempt = 1; ; attempt += 1) {
        try {
            // eslint-disable-next-line no-await-in-loop -- 시도는 순서대로여야 한다.
            return await runOnce();
        } catch (error) {
            if (isDeadlockError(error) && attempt < GOLD_PURCHASE_MAX_ATTEMPTS) continue;
            if (error?.code === 'DUPLICATE_PURCHASE_REQUEST') {
                // eslint-disable-next-line no-await-in-loop
                const existing = await findStored(null);
                if (existing) return consumeStored(existing);
            }
            throw error;
        }
    }
};

const grantReward = async ({ userId, amount, currency = CURRENCIES.GOLD, reason = 'REWARD', referenceEventId }, db = defaultDb()) => {
    if (!isValidCurrency(currency)) {
        throw createError('알 수 없는 재화입니다.', 400, 'INVALID_CURRENCY');
    }
    if (!Number.isInteger(amount) || amount <= 0) {
        throw createError('amount는 1 이상의 정수여야 합니다.', 400, 'INVALID_AMOUNT');
    }
    return applyLedgerTransaction(db, { userId, reason, currency, amount, referenceEventId });
};

const grantAchievementCurrency = async (
    { userId, currency, amount, referenceEventId },
    db = defaultDb(),
    { transaction: externalTransaction = null } = {},
) => {
    if (!isValidCurrency(currency)) {
        throw createError('알 수 없는 재화입니다.', 400, 'INVALID_CURRENCY');
    }
    if (!Number.isInteger(amount) || amount <= 0) {
        throw createError('amount는 1 이상의 정수여야 합니다.', 400, 'INVALID_AMOUNT');
    }
    return applyLedgerTransaction(
        db,
        { userId, reason: 'ACHIEVEMENT_REWARD', currency, amount, referenceEventId },
        { transaction: externalTransaction },
    );
};

const grantAchievementItem = async (
    { userId, itemId, itemType, referenceEventId },
    db = defaultDb(),
    { transaction: externalTransaction = null } = {},
) => {
    try {
        return await applyLedgerTransaction(
            db,
            {
                userId, reason: 'ACHIEVEMENT_REWARD', currency: CURRENCIES.GOLD, amount: 0,
                itemId, itemType, referenceEventId, entitlementSource: 'ACHIEVEMENT_GRANT',
            },
            { transaction: externalTransaction },
        );
    } catch (error) {
        if (error?.code === 'ITEM_ALREADY_OWNED') {
            return { idempotent: true, alreadyOwned: true };
        }
        throw error;
    }
};

const equipItem = async ({ userId, slot, itemId, expectedRevision }, db = defaultDb()) => {
    const expectedType = SLOT_TO_ITEM_TYPE[slot];
    const column = SLOT_TO_LOADOUT_COLUMN[slot];
    if (!expectedType || !column) {
        throw createError('알 수 없는 장착 슬롯입니다.', 400, 'UNKNOWN_EQUIP_SLOT');
    }
    if (typeof itemId !== 'string' || itemId.length === 0) {
        throw createError('itemId가 필요합니다.', 400, 'INVALID_ITEM_ID');
    }

    await ensureDefaultEntitlements(userId, db);

    const isFreeCardFrame = slot === 'PLAYER_CARD_FRAME' && itemId === FREE_CARD_FRAME_ID;
    const isFreeSkin = isFreeJobSkin(slot, itemId);
    const models = economyModels(db);

    if (!isFreeCardFrame && !isFreeSkin) {
        const catalogItem = catalog.getCatalogItem(itemId);
        if (!catalogItem || catalogItem.type !== expectedType) {
            throw createError('존재하지 않는 상품이거나 이 슬롯에 장착할 수 없는 종류입니다.', 400, 'ITEM_TYPE_MISMATCH');
        }

        const requiredPrefix = JOB_SKIN_ID_PREFIX_BY_SLOT[slot];
        if (requiredPrefix && !itemId.startsWith(`${SKIN_ITEM_ID_PREFIX}${requiredPrefix}`)) {
            throw createError('존재하지 않는 상품이거나 이 슬롯에 장착할 수 없는 종류입니다.', 400, 'ITEM_TYPE_MISMATCH');
        }

        const owned = await models.EconomyEntitlement.findOne({ where: { user_id: userId, item_id: itemId } });
        if (!owned) {
            throw createError('보유하지 않은 상품은 장착할 수 없습니다.', 403, 'ITEM_NOT_OWNED');
        }
    }

    await models.EconomyLoadout.findOrCreate({
        where: { user_id: userId },
        defaults: { user_id: userId, revision: crypto.randomUUID() },
    });

    const hasExpectedRevision = typeof expectedRevision === 'string' && expectedRevision.length > 0;

    return db.sequelize.transaction(async (t) => {
        const loadout = await models.EconomyLoadout.findOne({
            where: { user_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (hasExpectedRevision && loadout.revision !== expectedRevision) {
            throw createError(
                '장착 상태가 다른 곳에서 이미 변경되었습니다. 최신 상태를 다시 불러온 뒤 다시 시도하세요.',
                409,
                'SKIN_REVISION_CONFLICT',
            );
        }

        await loadout.update({ [column]: itemId, revision: crypto.randomUUID() }, { transaction: t });
        return loadout;
    });
};

const equipProfileAppearance = async ({ userId, photoItemId, borderItemId, expectedRevision }, db = defaultDb()) => {
    const slots = [
        ['PROFILE_PHOTO', photoItemId],
        ['PROFILE_BORDER', borderItemId],
    ].filter(([, itemId]) => itemId !== undefined);

    if (slots.length === 0) {
        throw createError('변경할 프로필 항목이 없습니다.', 400, 'EMPTY_PROFILE_EQUIP_REQUEST');
    }
    for (const [, itemId] of slots) {
        if (typeof itemId !== 'string' || itemId.length === 0) {
            throw createError('itemId가 필요합니다.', 400, 'INVALID_ITEM_ID');
        }
    }
    if (typeof expectedRevision !== 'string' || expectedRevision.length === 0) {
        throw createError('expectedRevision이 필요합니다.', 400, 'MISSING_EXPECTED_REVISION');
    }

    await ensureDefaultEntitlements(userId, db);
    const models = economyModels(db);

    const updates = {};
    for (const [slot, itemId] of slots) {
        const expectedType = SLOT_TO_ITEM_TYPE[slot];
        const column = SLOT_TO_LOADOUT_COLUMN[slot];
        const catalogItem = catalog.getCatalogItem(itemId);
        if (!catalogItem || catalogItem.type !== expectedType) {
            throw createError('존재하지 않는 상품이거나 이 슬롯에 장착할 수 없는 종류입니다.', 400, 'ITEM_TYPE_MISMATCH');
        }
        // eslint-disable-next-line no-await-in-loop -- 슬롯이 최대 2개뿐이고, 두 검증 모두
        const owned = await models.EconomyEntitlement.findOne({ where: { user_id: userId, item_id: itemId } });
        if (!owned) {
            throw createError('보유하지 않은 상품은 장착할 수 없습니다.', 403, 'ITEM_NOT_OWNED');
        }
        updates[column] = itemId;
    }

    await models.EconomyLoadout.findOrCreate({
        where: { user_id: userId },
        defaults: { user_id: userId, revision: crypto.randomUUID() },
    });

    return db.sequelize.transaction(async (t) => {
        const loadout = await models.EconomyLoadout.findOne({
            where: { user_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (loadout.revision !== expectedRevision) {
            throw createError(
                '프로필이 다른 곳에서 이미 변경되었습니다. 최신 상태를 다시 불러온 뒤 다시 시도하세요.',
                409,
                'PROFILE_REVISION_CONFLICT',
            );
        }

        await loadout.update({ ...updates, revision: crypto.randomUUID() }, { transaction: t });
        return loadout;
    });
};

const getPublicProfileLoadouts = async (userIds, db = defaultDb()) => {
    const uniqueUserIds = [...new Set(userIds)].filter((id) => typeof id === 'string' && id.length > 0);
    if (uniqueUserIds.length === 0) return {};

    const models = economyModels(db);
    await Promise.all(uniqueUserIds.map((userId) => ensureDefaultEntitlements(userId, db)));
    const loadouts = await models.EconomyLoadout.findAll({ where: { user_id: uniqueUserIds } });

    const byUserId = {};
    for (const userId of uniqueUserIds) byUserId[userId] = { profilePhotoId: null, profileBorderId: null };
    for (const loadout of loadouts) {
        byUserId[loadout.user_id] = {
            profilePhotoId: loadout.selected_profile_photo_id ?? null,
            profileBorderId: loadout.selected_profile_border_id ?? null,
        };
    }
    return byUserId;
};

const getGameStartLoadouts = async (userIds, db = defaultDb()) => {
    const uniqueUserIds = [...new Set(userIds)].filter((id) => typeof id === 'string' && id.length > 0);
    if (uniqueUserIds.length === 0) return {};

    const models = economyModels(db);
    await Promise.all(uniqueUserIds.map((userId) => ensureDefaultEntitlements(userId, db)));
    const loadouts = await models.EconomyLoadout.findAll({ where: { user_id: uniqueUserIds } });

    const byUserId = {};
    for (const userId of uniqueUserIds) {
        byUserId[userId] = {
            profilePhotoId: null,
            profileBorderId: null,
            cardFrameId: null,
            skinsByJob: buildSkinsByJob(null),
        };
    }
    for (const loadout of loadouts) {
        byUserId[loadout.user_id] = {
            profilePhotoId: loadout.selected_profile_photo_id ?? null,
            profileBorderId: loadout.selected_profile_border_id ?? null,
            cardFrameId: loadout.selected_card_frame_id ?? null,
            skinsByJob: buildSkinsByJob(loadout),
        };
    }
    return byUserId;
};

const emojiPaletteDefaults = (userId) => ({
    user_id: userId,
    ...Object.fromEntries(EMOJI_PALETTE_SLOT_COLUMNS.map((column, index) => [column, DEFAULT_EMOJI_PALETTE_SLOTS[index]])),
    revision: crypto.randomUUID(),
});

const emojiPaletteSlotsOf = (row) => EMOJI_PALETTE_SLOT_COLUMNS.map((column) => row[column] ?? null);

const listOwnedEmoticons = async (models, userId, transaction = null) => {
    const rows = await models.EconomyEntitlement.findAll({
        where: { user_id: userId, item_type: ITEM_TYPES.EMOTICON },
        ...(transaction ? { transaction } : {}),
    });
    return rows.map((row) => row.item_id);
};

const assertValidEmojiSlots = (slots) => {
    const invalid = () => createError('slots가 올바르지 않습니다.', 400, 'INVALID_SLOTS');
    if (!Array.isArray(slots) || slots.length !== EMOJI_PALETTE_SLOT_COLUMNS.length) throw invalid();
    if (slots.some((value) => value !== null && (typeof value !== 'string' || value.length === 0))) throw invalid();
    const filled = slots.filter((value) => value !== null);
    if (new Set(filled).size !== filled.length) throw invalid();
};

const getEmojiPalette = async (userId, db = defaultDb()) => {
    await ensureDefaultEntitlements(userId, db);
    const models = economyModels(db);

    const [row] = await models.EconomyEmojiPalette.findOrCreate({
        where: { user_id: userId },
        defaults: emojiPaletteDefaults(userId),
    });

    return {
        slots: emojiPaletteSlotsOf(row),
        revision: row.revision,
        owned: await listOwnedEmoticons(models, userId),
    };
};

const saveEmojiPalette = async (userId, { slots, expectedRevision } = {}, db = defaultDb()) => {
    if (typeof expectedRevision !== 'string' || expectedRevision.length === 0) {
        throw createError('expectedRevision이 필요합니다.', 400, 'MISSING_EXPECTED_REVISION');
    }
    assertValidEmojiSlots(slots);

    await ensureDefaultEntitlements(userId, db);
    const models = economyModels(db);

    return db.sequelize.transaction(async (t) => {
        await models.EconomyEmojiPalette.findOrCreate({
            where: { user_id: userId },
            defaults: emojiPaletteDefaults(userId),
            transaction: t,
        });

        const owned = new Set(await listOwnedEmoticons(models, userId, t));
        if (slots.some((value) => value !== null && !owned.has(value))) {
            throw createError('소유하지 않은 이모티콘입니다.', 400, 'NOT_OWNED');
        }

        const revision = crypto.randomUUID();
        const patch = { revision };
        EMOJI_PALETTE_SLOT_COLUMNS.forEach((column, index) => { patch[column] = slots[index]; });

        const [affected] = await models.EconomyEmojiPalette.update(patch, {
            where: { user_id: userId, revision: expectedRevision },
            transaction: t,
        });
        if (affected === 1) return { slots: [...slots], revision };

        const current = await models.EconomyEmojiPalette.findOne({
            where: { user_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        const error = createError(
            '이모티콘 팔레트가 다른 곳에서 이미 변경되었습니다. 최신 상태를 다시 불러온 뒤 다시 시도하세요.',
            409,
            'REVISION_MISMATCH',
        );
        error.revision = current.revision;
        error.slots = emojiPaletteSlotsOf(current);
        throw error;
    });
};

module.exports = {
    CURRENCIES,
    FREE_CARD_FRAME_ID,
    SLOT_TO_ITEM_TYPE,
    ensureDefaultEntitlements,
    getWalletSummary,
    listTransactions,
    purchaseItem,
    purchaseItems,
    getPurchaseResult,
    purchaseGold,
    grantReward,
    grantAchievementCurrency,
    grantAchievementItem,
    equipItem,
    equipProfileAppearance,
    getPublicProfileLoadouts,
    getGameStartLoadouts,
    getEmojiPalette,
    saveEmojiPalette,
    DEFAULT_EMOJI_PALETTE_SLOTS,
    buildSkinsByJob,
    applyLedgerTransaction,
    MAX_BALANCE,
    __internal: { applyLedgerTransaction, ensureWalletRow, ensureDefaultLoadout },
};
