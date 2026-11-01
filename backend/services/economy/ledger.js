'use strict';

// 장부 거래 파일, 지갑 행 보장 + 잔액 바꾸고 장부 쓰기 한 트랜잭션
// defaults·purchase·goldPurchase·grants·topup/grant.js가 부름 (돈·보유는 다 여기로, 같은 참조 id는 한 번만)
const { createError } = require('../../utils/appError');
const { isValidCurrency, isBoundedAmount, payloadMatches, referenceConflictError } = require('./helpers');
const { CURRENCY_TO_COLUMN, MAX_BALANCE } = require('./constants');
const { economyModels } = require('../../repositories/economy/models');
const walletRepository = require('../../repositories/economy/wallet');
const ledgerRepository = require('../../repositories/economy/ledger');
const entitlementRepository = require('../../repositories/economy/entitlement');
const { withTransaction, isUniqueConstraintName } = require('../../repositories/common');

// 지갑 행 없으면 만듦 (동시에 만들어도 하나만)
const ensureWalletRow = async (db, userId, externalTransaction = null) => {
    const models = economyModels(db);
    try {
        await walletRepository.createEmptyWallet(models, userId, externalTransaction);
    } catch (error) {
        // 이미 있으면(유일 제약) 그냥 넘어감
        if (!isUniqueConstraintName(error)) throw error;
    }
};

// 같은 참조 id 먼저 확인 → 지갑 잠금 → 잔액·보유 바꾸고 장부 남김, 바깥 트랜잭션도 받음
const applyLedgerTransaction = async (db, {
    userId, reason, currency, amount, itemId = null, itemType = null, referenceEventId, entitlementSource = null,
}, { transaction: externalTransaction = null } = {}) => {
    // 참조 id·통화·금액 모양 먼저 (잘못된 값으로 지갑 안 건드리게)
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

    // 이미 처리된 참조 id면 잠금 없이 처음 결과 그대로 (내용 다르면 409)
    const preExisting = await ledgerRepository.findByReference(models, { userId, referenceEventId }, externalTransaction);
    if (preExisting) {
        if (!payloadMatches(preExisting, payload)) throw referenceConflictError();
        return { idempotent: true, ledgerEntry: preExisting };
    }

    // 잠글 지갑 행부터 보장
    await ensureWalletRow(db, userId, externalTransaction);

    // 지갑 잠근 뒤 실제 쓰기 (같은 사람 돈 움직임은 한 줄로 세움)
    const runWrite = async (t) => {
        const wallet = await walletRepository.lockWallet(models, userId, t);

        // 잠그는 사이 다른 요청이 같은 참조 id를 끝냈을 수 있어 다시 봄
        const committed = await ledgerRepository.findByReference(models, { userId, referenceEventId }, t);
        if (committed) {
            if (!payloadMatches(committed, payload)) throw referenceConflictError();
            return { idempotent: true, ledgerEntry: committed };
        }

        // 이미 가진 아이템은 다시 안 줌 (돈 빠지기 전에 거절)
        if (itemId) {
            const owned = await entitlementRepository.findOwned(models, { userId, itemId }, t);
            if (owned) {
                throw createError('이미 보유한 상품입니다.', 409, 'ITEM_ALREADY_OWNED');
            }
        }

        // 잔액은 0 밑·최대 잔액 위로 안 감
        const column = CURRENCY_TO_COLUMN[currency];
        const newBalance = wallet[column] + amount;
        if (newBalance < 0) {
            throw createError('잔액이 부족합니다.', 400, 'INSUFFICIENT_BALANCE');
        }
        if (newBalance > MAX_BALANCE) {
            throw createError('잔액 한도를 초과했습니다.', 400, 'BALANCE_LIMIT_EXCEEDED');
        }

        // 여기부터 진짜 바뀜: 잔액 저장 → 장부 한 줄 → 아이템이면 보유 한 줄
        await walletRepository.saveWallet(wallet, { [column]: newBalance }, t);

        let ledgerEntry;
        try {
            ledgerEntry = await ledgerRepository.createEntry(models, {
                user_id: userId,
                reason,
                item_id: itemId,
                currency,
                amount,
                balance_after: newBalance,
                reference_event_id: referenceEventId,
            }, t);
        } catch (error) {
            // 같은 참조 id가 동시에 들어와 유일 제약에 걸린 경우
            if (isUniqueConstraintName(error)) {
                throw Object.assign(
                    createError('이미 처리된 참조 사건입니다.', 409, 'DUPLICATE_REFERENCE_EVENT'),
                    { referenceEventId },
                );
            }
            throw error;
        }

        if (itemId) {
            await entitlementRepository.createOwned(models, {
                user_id: userId,
                item_id: itemId,
                item_type: itemType,
                source: entitlementSource,
            }, t);
        }

        return { idempotent: false, ledgerEntry, walletBalance: newBalance };
    };

    // 겹친 참조 id면 먼저 끝난 쪽 결과로 (내용 다르면 409)
    const resolveDuplicate = async (transactionForLookup) => {
        const existing = await ledgerRepository.findByReference(models, { userId, referenceEventId }, transactionForLookup);
        if (!existing) return null;
        if (!payloadMatches(existing, payload)) throw referenceConflictError();
        return { idempotent: true, ledgerEntry: existing };
    };

    // 바깥 트랜잭션이면 그 안에서만 (커밋·롤백은 부른 쪽 몫)
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

    // 아니면 새 트랜잭션, 겹침 오류면 롤백 뒤 커밋된 결과 다시 읽음
    try {
        return await withTransaction(models, runWrite);
    } catch (error) {
        if (error?.code === 'DUPLICATE_REFERENCE_EVENT') {
            const resolved = await resolveDuplicate(null);
            if (resolved) return resolved;
        }
        throw error;
    }
};

module.exports = {
    ensureWalletRow,
    applyLedgerTransaction,
};
