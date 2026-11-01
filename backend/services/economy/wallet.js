'use strict';

// 지갑 조회 파일, 지갑 요약(잔액·보유·장착) · 거래 목록
// index 거쳐 controllers/economy/account.js가 부름
const { defaultDb, buildSkinsByJob } = require('./helpers');
const { ensureDefaultEntitlements } = require('./defaults');
const { economyModels } = require('../../repositories/economy/models');
const walletRepository = require('../../repositories/economy/wallet');
const entitlementRepository = require('../../repositories/economy/entitlement');
const loadoutRepository = require('../../repositories/economy/loadout');
const ledgerRepository = require('../../repositories/economy/ledger');

// 처음 보는 계정이면 기본 지급부터 하고 잔액·보유·장착을 같이
const getWalletSummary = async (userId, db = defaultDb()) => {
    await ensureDefaultEntitlements(userId, db);
    const models = economyModels(db);

    // 셋 다 읽기만이라 한꺼번에
    const [wallet, entitlements, loadout] = await Promise.all([
        walletRepository.findWallet(models, userId),
        entitlementRepository.listOwned(models, userId),
        loadoutRepository.findLoadout(models, userId),
    ]);

    // 지갑·장착 행 없으면 0·null로
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

// 장부 최근 것부터 최대 limit개
const listTransactions = async (userId, { limit = 50 } = {}, db = defaultDb()) => {
    const models = economyModels(db);
    const rows = await ledgerRepository.listEntries(models, userId, limit);
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

module.exports = {
    getWalletSummary,
    listTransactions,
};
