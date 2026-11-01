'use strict';

// 보상 지급 파일, 일반 보상 · 업적 통화/아이템 지급
// index 거쳐 controllers/economy/purchase.js(관리자 지급)·services/achievement/grant.js가 부름
const { createError } = require('../../utils/appError');
const { isValidCurrency, defaultDb } = require('./helpers');
const { CURRENCIES } = require('./constants');
const { applyLedgerTransaction } = require('./ledger');

// 참조 id 꼭 받아 장부 거래로 (두 번 안 주게)
const grantReward = async ({ userId, amount, currency = CURRENCIES.GOLD, reason = 'REWARD', referenceEventId }, db = defaultDb()) => {
    // 모르는 통화·0 이하 금액 거절 (보상은 늘 더하기)
    if (!isValidCurrency(currency)) {
        throw createError('알 수 없는 재화입니다.', 400, 'INVALID_CURRENCY');
    }
    if (!Number.isInteger(amount) || amount <= 0) {
        throw createError('amount는 1 이상의 정수여야 합니다.', 400, 'INVALID_AMOUNT');
    }
    return applyLedgerTransaction(db, { userId, reason, currency, amount, referenceEventId });
};

// 업적 통화 보상, 업적 기록 트랜잭션 안에서 같이 (실패하면 같이 롤백)
const grantAchievementCurrency = async (
    { userId, currency, amount, referenceEventId },
    db = defaultDb(),
    { transaction: externalTransaction = null } = {},
) => {
    // 모르는 통화·0 이하 금액 거절
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

// 업적 아이템 보상, 이미 가진 아이템이면 실패 아닌 그대로
const grantAchievementItem = async (
    { userId, itemId, itemType, referenceEventId },
    db = defaultDb(),
    { transaction: externalTransaction = null } = {},
) => {
    // 0골드 장부라 보유만 남김
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
        // 이미 가진 아이템 때문에 업적 기록까지 롤백되지 않게
        if (error?.code === 'ITEM_ALREADY_OWNED') {
            return { idempotent: true, alreadyOwned: true };
        }
        throw error;
    }
};

module.exports = {
    grantReward,
    grantAchievementCurrency,
    grantAchievementItem,
};
