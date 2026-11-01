'use strict';

// 골드 구매 파일, 다이아로 골드 사기 + 데드락이면 다시 (상품 확인은 ./currencyProducts, 돈은 ./ledger)
// index 거쳐 controllers/economy/purchase.js가 부름
const crypto = require('crypto');
const { createError } = require('../../utils/appError');
const { defaultDb, purchaseConflictError, snapshotLedgerEntry } = require('./helpers');
const { CURRENCIES, GOLD_PURCHASE_REASON, GOLD_PURCHASE_KIND, GOLD_PURCHASE_MAX_ATTEMPTS } = require('./constants');
const { ensureWalletRow, applyLedgerTransaction } = require('./ledger');
const { economyModels } = require('../../repositories/economy/models');
const walletRepository = require('../../repositories/economy/wallet');
const requestRepository = require('../../repositories/economy/purchaseRequest');
const { withTransaction, isUniqueConstraintName, isDeadlockError } = require('../../repositories/common');

// 다이아 빼기·골드 넣기 두 장부 참조 id (요청 id가 150자까지라 해시로 길이 고정)
const deriveLegReferenceId = (referenceEventId, leg) =>
    `gold:${crypto.createHash('sha256').update(referenceEventId).digest('hex')}:${leg}`;

// 저장된 구매 결과에서 응답 모양 (결과 순서: 다이아 → 골드)
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

// READ COMMITTED라 잠근 뒤 남의 커밋을 바로 봄, 데드락이면 정해진 횟수까지 다시
const purchaseGold = async ({ userId, productId, version, referenceEventId }, db = defaultDb()) => {
    // 요청 모양 확인 (컨트롤러와 같은 규칙, 서비스 바로 불러도 막기)
    if (typeof userId !== 'string' || userId.length === 0
        || typeof productId !== 'string' || productId.length === 0 || productId.length > 64
        || !Number.isSafeInteger(version) || version <= 0
        || typeof referenceEventId !== 'string' || referenceEventId.length === 0 || referenceEventId.length > 150) {
        throw goldPurchaseInvalid();
    }

    const models = economyModels(db);
    const payload = { type: GOLD_PURCHASE_REASON, productId, version };

    // 저장된 요청이 골드 구매·같은 상품·같은 버전일 때만 그 결과 (아니면 409)
    const consumeStored = (stored) => {
        const storedPayload = typeof stored.payload_json === 'string' ? JSON.parse(stored.payload_json) : stored.payload_json;
        if (stored.kind !== GOLD_PURCHASE_KIND
            || storedPayload?.type !== payload.type
            || storedPayload?.productId !== payload.productId
            || storedPayload?.version !== payload.version) {
            throw purchaseConflictError();
        }
        return goldPurchaseResultOf(stored);
    };
    // 참조 id로 저장된 구매 요청 (트랜잭션 주면 그 안에서)
    const findStored = (transaction) => requestRepository.findRequestByReference(models, { userId, referenceEventId }, transaction);

    // 이미 끝난 요청이면 트랜잭션 없이 처음 결과 그대로
    const preExisting = await findStored(null);
    if (preExisting) return consumeStored(preExisting);

    // 재화 상품 입구 (부를 때 require, 지금은 순환 없어 위로 올려도 됨)
    const currencyProductsService = require('./currencyProducts');

    // 한 번 시도: 상품 확인 → 지갑 잠금 → 끝난 요청인지 → 다이아 빼고 골드 넣기 → 요청 행
    const runOnce = () => withTransaction(models, { isolationLevel: 'READ COMMITTED' }, async (t) => {
        // 상품 오류는 잠근 뒤로 미룸 (이미 끝난 요청이면 상품 바뀌어도 처음 결과)
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

        // 지갑 잠금, 없으면 만들고 다시 잠금
        const lockWallet = () => walletRepository.lockWallet(models, userId, t);
        let wallet = await lockWallet();
        if (!wallet) {
            await ensureWalletRow(db, userId, t);
            wallet = await lockWallet();
        }

        // 잠근 뒤 같은 참조 id 다시 봄 (동시 요청 중 하나만 돈 움직임)
        const committed = await findStored(t);
        if (committed) return consumeStored(committed);
        if (productError) throw productError;

        // 값은 서버 상품 값만, 다이아 모자라면 거절 (지갑 안 바뀜)
        const payAmount = product.payAmount;
        const grantTotal = product.grantAmount + product.bonusAmount;
        if (wallet.balance_diamond < payAmount) {
            throw createError('다이아 잔액이 부족합니다.', 400, 'INSUFFICIENT_DIAMOND');
        }

        // 여기부터 진짜 바뀜: 다이아 빼기 → 골드 넣기 (같은 트랜잭션)
        const diamondOutcome = await applyLedgerTransaction(db, {
            userId,
            reason: GOLD_PURCHASE_REASON,
            currency: CURRENCIES.DIAMOND,
            amount: -payAmount,
            referenceEventId: deriveLegReferenceId(referenceEventId, 'diamond'),
        }, { transaction: t });
        const goldOutcome = await applyLedgerTransaction(db, {
            userId,
            reason: GOLD_PURCHASE_REASON,
            currency: CURRENCIES.GOLD,
            amount: grantTotal,
            referenceEventId: deriveLegReferenceId(referenceEventId, 'gold'),
        }, { transaction: t });
        // 두 장부 중 하나라도 이미 있었으면 꼬인 상태라 500 (전부 롤백)
        if (diamondOutcome.idempotent || goldOutcome.idempotent) {
            throw createError('골드 구매 원장 상태가 일치하지 않습니다.', 500, 'GOLD_PURCHASE_LEDGER_INCONSISTENT');
        }

        // 구매 요청 행에 결과 저장 (다시 묻기·같은 요청 응답용)
        const results = [snapshotLedgerEntry(diamondOutcome.ledgerEntry), snapshotLedgerEntry(goldOutcome.ledgerEntry)];
        try {
            await requestRepository.createRequest(models, {
                user_id: userId,
                reference_event_id: referenceEventId,
                kind: GOLD_PURCHASE_KIND,
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

        return {
            idempotent: false,
            kind: GOLD_PURCHASE_KIND,
            results,
            balanceDiamond: diamondOutcome.walletBalance,
            balanceGold: goldOutcome.walletBalance,
        };
    });

    // 성공·다른 오류·횟수 다 쓸 때까지 시도
    for (let attempt = 1; ; attempt += 1) {
        try {
            // eslint-disable-next-line no-await-in-loop -- 시도는 하나씩 차례대로
            return await runOnce();
        } catch (error) {
            // 데드락이면 처음부터 다시 (롤백됐으니 안전)
            if (isDeadlockError(error) && attempt < GOLD_PURCHASE_MAX_ATTEMPTS) continue;
            // 겹침 오류면 먼저 커밋된 쪽 결과로 (내용 다르면 409)
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
