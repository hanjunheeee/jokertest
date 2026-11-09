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

// 참조 id·통화·금액 모양 먼저 (잘못된 값으로 지갑 안 건드리게)
const assertLedgerInput = ({ referenceEventId, currency, amount }) => {
    if (typeof referenceEventId !== 'string' || referenceEventId.length === 0) {
        throw createError('참조 사건 ID(referenceEventId)가 필요합니다.', 400, 'MISSING_REFERENCE_EVENT_ID');
    }
    if (!isValidCurrency(currency)) {
        throw createError('알 수 없는 재화입니다.', 400, 'INVALID_CURRENCY');
    }
    if (!isBoundedAmount(amount)) {
        throw createError('금액이 허용 범위를 벗어난 정수여야 합니다.', 400, 'AMOUNT_OUT_OF_RANGE');
    }
};

// 이미 있는 장부 행이면 처음 결과 그대로 (내용 다르면 409)
const reuseEntry = (entry, payload) => {
    if (!payloadMatches(entry, payload)) throw referenceConflictError();
    return { idempotent: true, ledgerEntry: entry };
};

// 잔액은 0 밑·최대 잔액 위로 안 감
const nextBalanceOf = (wallet, currency, amount) => {
    const column = CURRENCY_TO_COLUMN[currency];
    const newBalance = wallet[column] + amount;
    if (newBalance < 0) {
        throw createError('잔액이 부족합니다.', 400, 'INSUFFICIENT_BALANCE');
    }
    if (newBalance > MAX_BALANCE) {
        throw createError('잔액 한도를 초과했습니다.', 400, 'BALANCE_LIMIT_EXCEEDED');
    }
    return { column, newBalance };
};

// 장부 한 줄, 같은 참조 id가 동시에 들어와 유일 제약에 걸리면 겹침 오류
const createEntryOnce = async (models, row, t) => {
    try {
        return await ledgerRepository.createEntry(models, row, t);
    } catch (error) {
        if (isUniqueConstraintName(error)) {
            throw Object.assign(
                createError('이미 처리된 참조 사건입니다.', 409, 'DUPLICATE_REFERENCE_EVENT'),
                { referenceEventId: row.reference_event_id },
            );
        }
        throw error;
    }
};

// 지갑 잠근 뒤 실제 쓰기 (같은 사람 돈 움직임은 한 줄로 세움)
const writeLedger = async (models, input, payload, t) => {
    const { userId, reason, currency, amount, itemId, itemType, referenceEventId, entitlementSource } = input;
    const wallet = await walletRepository.lockWallet(models, userId, t);

    // 잠그는 사이 다른 요청이 같은 참조 id를 끝냈을 수 있어 다시 봄
    const committed = await ledgerRepository.findByReference(models, { userId, referenceEventId }, t);
    if (committed) return reuseEntry(committed, payload);

    // 이미 가진 아이템은 다시 안 줌 (돈 빠지기 전에 거절)
    if (itemId && await entitlementRepository.findOwned(models, { userId, itemId }, t)) {
        throw createError('이미 보유한 상품입니다.', 409, 'ITEM_ALREADY_OWNED');
    }

    const { column, newBalance } = nextBalanceOf(wallet, currency, amount);

    // 여기부터 진짜 바뀜: 잔액 저장 → 장부 한 줄 → 아이템이면 보유 한 줄
    await walletRepository.saveWallet(wallet, { [column]: newBalance }, t);
    const ledgerEntry = await createEntryOnce(models, {
        user_id: userId,
        reason,
        item_id: itemId,
        currency,
        amount,
        balance_after: newBalance,
        reference_event_id: referenceEventId,
    }, t);
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

// 같은 참조 id 먼저 확인 → 지갑 잠금 → 잔액·보유 바꾸고 장부 남김, 바깥 트랜잭션도 받음
const applyLedgerTransaction = async (db, {
    userId, reason, currency, amount, itemId = null, itemType = null, referenceEventId, entitlementSource = null,
}, { transaction: externalTransaction = null } = {}) => {
    assertLedgerInput({ referenceEventId, currency, amount });

    const models = economyModels(db);
    const payload = { reason, itemId, currency, amount };
    const input = { userId, reason, currency, amount, itemId, itemType, referenceEventId, entitlementSource };
    const findEntry = (t) => ledgerRepository.findByReference(models, { userId, referenceEventId }, t);

    // 이미 처리된 참조 id면 잠금 없이 처음 결과 그대로
    const preExisting = await findEntry(externalTransaction);
    if (preExisting) return reuseEntry(preExisting, payload);

    // 잠글 지갑 행부터 보장
    await ensureWalletRow(db, userId, externalTransaction);

    // 바깥 트랜잭션이면 그 안에서만 (커밋·롤백은 부른 쪽 몫), 아니면 새 트랜잭션
    const write = externalTransaction
        ? () => writeLedger(models, input, payload, externalTransaction)
        : () => withTransaction(models, (t) => writeLedger(models, input, payload, t));
    try {
        return await write();
    } catch (error) {
        // 겹친 참조 id면 먼저 끝난 쪽 결과로 (새 트랜잭션은 롤백 뒤 커밋된 결과 다시 읽음)
        const existing = error?.code === 'DUPLICATE_REFERENCE_EVENT' ? await findEntry(externalTransaction) : null;
        if (existing) return reuseEntry(existing, payload);
        throw error;
    }
};

module.exports = {
    ensureWalletRow,
    applyLedgerTransaction,
};
