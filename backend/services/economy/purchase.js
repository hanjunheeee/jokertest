'use strict';

// 아이템 구매 파일, 묶음·단건 구매 + 구매 결과 다시 묻기
// index 거쳐 controllers/economy/purchase.js가 부름
const catalog = require('./catalog');
const { createError } = require('../../utils/appError');
const { defaultDb, purchasePayloadsEqual, purchaseConflictError, snapshotLedgerEntry } = require('./helpers');
const { CURRENCIES } = require('./constants');
const { ensureWalletRow, applyLedgerTransaction } = require('./ledger');
const { economyModels } = require('../../repositories/economy/models');
const walletRepository = require('../../repositories/economy/wallet');
const requestRepository = require('../../repositories/economy/purchaseRequest');
const { withTransaction, isUniqueConstraintName } = require('../../repositories/common');

// 묶음 안 아이템마다 장부 참조 id (요청 id + 아이템 id)
const deriveItemReferenceId = (referenceEventId, itemId) => `${referenceEventId}::item::${itemId}`;

// 아이템 순서 상관없이 같은 요청으로 보게 정렬
const normalizePayload = (items) => ({ itemIds: items.map((entry) => entry.itemId).slice().sort() });

// 구매 요청 행 먼저 확인 → 지갑 잠금 → 아이템마다 장부 거래, 다 되거나 다 안 되거나
const purchaseItems = async ({ userId, items, referenceEventId }, db = defaultDb()) => {
    // 참조 id·아이템 목록 모양 확인 (빈 목록·같은 아이템 두 번 거절)
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
    const payload = normalizePayload(items);
    const models = economyModels(db);

    // 같은 참조 id 요청은 처음 결과 그대로 (중복 결제 막기, 내용 다르면 409)
    const preExisting = await requestRepository.findRequestByReference(models, { userId, referenceEventId });
    if (preExisting) {
        if (!purchasePayloadsEqual(preExisting.payload_json, payload)) throw purchaseConflictError();
        return { idempotent: true, kind: preExisting.kind, results: preExisting.result_json };
    }

    // 상품 목록에 있고 파는 것만, 값은 서버 목록 값만 믿음
    const resolvedItems = itemIds.map((itemId) => {
        const catalogItem = catalog.getCatalogItem(itemId);
        if (!catalogItem || catalogItem.purchasable !== true) {
            throw createError(`존재하지 않거나 구매할 수 없는 상품입니다: ${itemId}`, 400, 'ITEM_NOT_PURCHASABLE');
        }
        return catalogItem;
    });

    // 잠글 지갑 행부터 보장
    await ensureWalletRow(db, userId);

    // 지갑 잠근 뒤 실제 쓰기 (같은 사람 구매는 한 줄로 세움)
    const runWrite = async (t) => {
        await walletRepository.lockWallet(models, userId, t);

        // 잠그는 사이 같은 참조 id 요청이 끝났으면 그 결과로
        const committed = await requestRepository.findRequestByReference(models, { userId, referenceEventId }, t);
        if (committed) {
            if (!purchasePayloadsEqual(committed.payload_json, payload)) throw purchaseConflictError();
            return { idempotent: true, kind: committed.kind, results: committed.result_json };
        }

        // 여기부터 진짜 바뀜: 아이템마다 골드 빼고 보유 넣음 (하나라도 실패하면 전부 롤백)
        const results = [];
        for (const catalogItem of resolvedItems) {
            // eslint-disable-next-line no-await-in-loop -- 같은 트랜잭션 t 위라 하나씩 차례대로
            const outcome = await applyLedgerTransaction(db, {
                userId,
                reason: 'PURCHASE',
                currency: catalogItem.currency ?? CURRENCIES.GOLD,
                amount: -catalogItem.priceGold,
                itemId: catalogItem.id,
                itemType: catalogItem.type,
                referenceEventId: deriveItemReferenceId(referenceEventId, catalogItem.id),
                entitlementSource: 'PURCHASE',
            }, { transaction: t });
            results.push(snapshotLedgerEntry(outcome.ledgerEntry));
        }

        // 구매 요청 행에 결과까지 저장 (다시 묻기·같은 요청 응답용)
        let purchaseRequest;
        try {
            purchaseRequest = await requestRepository.createRequest(models, {
                user_id: userId,
                reference_event_id: referenceEventId,
                kind,
                payload_json: payload,
                result_json: results,
            }, t);
        } catch (error) {
            // 같은 참조 id가 동시에 와서 유일 제약에 걸린 경우
            if (isUniqueConstraintName(error)) {
                throw Object.assign(
                    createError('이미 처리된 참조 사건입니다.', 409, 'DUPLICATE_PURCHASE_REQUEST'),
                    { referenceEventId },
                );
            }
            throw error;
        }

        return { idempotent: false, kind, results, purchaseRequestId: purchaseRequest.id };
    };

    // 겹친 요청이면 먼저 커밋된 쪽 결과로 (내용 다르면 409)
    const resolveDuplicateRequest = async () => {
        const existing = await requestRepository.findRequestByReference(models, { userId, referenceEventId });
        if (!existing) return null;
        if (!purchasePayloadsEqual(existing.payload_json, payload)) throw purchaseConflictError();
        return { idempotent: true, kind: existing.kind, results: existing.result_json };
    };

    // 겹침 오류면 롤백 뒤 커밋된 결과 다시 읽음
    try {
        return await withTransaction(models, runWrite);
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
    // 없으면 null (404는 컨트롤러 몫)
    const existing = await requestRepository.findRequestByReference(models, { userId, referenceEventId });
    if (!existing) return null;
    return { kind: existing.kind, results: existing.result_json, createdAt: existing.created_at };
};

module.exports = {
    purchaseItems,
    purchaseItem,
    getPurchaseResult,
};
