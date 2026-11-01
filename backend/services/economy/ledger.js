'use strict';

// 장부 거래 파일, 지갑 행 보장 + 잔액 바꾸고 장부 쓰기 한 트랜잭션
// 구매·지급·충전이 다 이 함수로 돈 움직임 (같은 참조 id는 한 번만)
const { createError } = require('../../utils/appError');
const { isValidCurrency, isBoundedAmount, payloadMatches, referenceEventConflictError } = require('./helpers');
const { CURRENCY_TO_WALLET_COLUMN, MAX_BALANCE } = require('./constants');

// 경제 모델 묶음 꺼내기 (db에 바로 없는 모델은 sequelize models에서)
const economyModels = (db) => ({
    sequelize: db.sequelize,
    EconomyWallet: db.sequelize.models.EconomyWallet,
    EconomyLedgerEntry: db.EconomyLedgerEntry,
    EconomyEntitlement: db.sequelize.models.EconomyEntitlement,
    EconomyLoadout: db.sequelize.models.EconomyLoadout,
    EconomyPurchaseRequest: db.sequelize.models.EconomyPurchaseRequest,
    EconomyEmojiPalette: db.sequelize.models.EconomyEmojiPalette,
});

// 지갑 행 없으면 만듦 (동시에 만들어도 하나만)
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

// 같은 참조 id 먼저 확인 → 지갑 잠금 → 잔액·보유 바꾸고 장부 남김, 바깥 트랜잭션도 받음
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

module.exports = {
    economyModels,
    ensureWalletRow,
    applyLedgerTransaction,
};
