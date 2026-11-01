'use strict';

// 아이템 구매 파일, 묶음·단건 구매 + 구매 결과 다시 묻기
// 같은 참조 id 요청은 처음 결과 그대로 (중복 결제 막기)
const catalog = require('../../economy/catalog');
const { createError } = require('../../utils/appError');
const { defaultDb, purchasePayloadsEqual, purchaseRequestConflictError, snapshotLedgerEntry } = require('./helpers');
const { CURRENCIES } = require('./constants');
const { ensureWalletRow, applyLedgerTransaction } = require('./ledger');
const { economyModels } = require('../../repositories/economy/models');

// 묶음 안 아이템마다 장부 참조 id
const derivePurchaseItemReferenceEventId = (referenceEventId, itemId) => `${referenceEventId}::item::${itemId}`;

// 아이템 순서 상관없이 같은 요청으로 보게 정렬
const normalizePurchaseRequestPayload = (items) => ({ itemIds: items.map((entry) => entry.itemId).slice().sort() });

// 구매 요청 행 먼저 확인 → 지갑 잠금 → 아이템마다 장부 거래, 다 되거나 다 안 되거나
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

// 한 개 구매도 묶음 구매로
const purchaseItem = async ({ userId, itemId, referenceEventId }, db = defaultDb()) => {
    const result = await purchaseItems({ userId, items: [{ itemId }], referenceEventId }, db);
    return { idempotent: result.idempotent, ledgerEntry: result.results[0] };
};

// 응답 놓친 구매를 참조 id로 다시 묻기
const getPurchaseResult = async (userId, referenceEventId, db = defaultDb()) => {
    if (typeof referenceEventId !== 'string' || referenceEventId.length === 0) {
        throw createError('참조 사건 ID(referenceEventId)가 필요합니다.', 400, 'MISSING_REFERENCE_EVENT_ID');
    }
    const models = economyModels(db);
    const existing = await models.EconomyPurchaseRequest.findOne({ where: { user_id: userId, reference_event_id: referenceEventId } });
    if (!existing) return null;
    return { kind: existing.kind, results: existing.result_json, createdAt: existing.created_at };
};

module.exports = {
    purchaseItems,
    purchaseItem,
    getPurchaseResult,
};
