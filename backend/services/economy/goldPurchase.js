'use strict';

// 골드 구매 파일, 다이아로 골드 사기 + 데드락이면 다시
// 상품 버전 확인은 재화 상품 서비스, 돈 움직임은 장부 거래
const crypto = require('crypto');
const { createError } = require('../../utils/appError');
const { defaultDb, purchaseRequestConflictError, snapshotLedgerEntry } = require('./helpers');
const { CURRENCIES, GOLD_PURCHASE_REASON, GOLD_PURCHASE_KIND, GOLD_PURCHASE_MAX_ATTEMPTS } = require('./constants');
const { ensureWalletRow, applyLedgerTransaction } = require('./ledger');
const { economyModels } = require('../../repositories/economy/models');
const walletRepository = require('../../repositories/economy/wallet');
const purchaseRequestRepository = require('../../repositories/economy/purchaseRequest');
const { withTransaction, isUniqueConstraintName, isDeadlockError } = require('../../repositories/common');

// 다이아 빼기·골드 넣기 두 장부 참조 id (요청 id 해시)
const deriveGoldPurchaseReferenceEventId = (referenceEventId, leg) =>
    `gold:${crypto.createHash('sha256').update(referenceEventId).digest('hex')}:${leg}`;

// 저장된 구매 결과에서 응답 모양
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

// 요청 모양 틀리면 400
const goldPurchaseInvalid = () => createError('골드 구매 요청 형식이 올바르지 않습니다.', 400, 'INVALID_GOLD_PURCHASE_REQUEST');

// READ COMMITTED 트랜잭션, 데드락이면 정해진 횟수까지 다시
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
    const findStored = (transaction) => purchaseRequestRepository.findRequestByReference(models, { userId, referenceEventId }, transaction);

    const preExisting = await findStored(null);
    if (preExisting) return consumeStored(preExisting);

    const currencyProductsService = require('./currencyProducts');

    const runOnce = () => withTransaction(models, { isolationLevel: 'READ COMMITTED' }, async (t) => {
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

        const lockWallet = () => walletRepository.lockWallet(models, userId, t);
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
            await purchaseRequestRepository.createRequest(models, {
                user_id: userId,
                reference_event_id: referenceEventId,
                kind: GOLD_PURCHASE_KIND,
                payload_json: payload,
                result_json: results,
            }, t);
        } catch (error) {
            if (isUniqueConstraintName(error)) {
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

module.exports = {
    purchaseGold,
};
