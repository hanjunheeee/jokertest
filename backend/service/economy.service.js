'use strict';

// F-08 지갑·거래·카탈로그·소유권 서비스. 구매·기본 지급·QA/보상 지급을 모두 같은
// applyLedgerTransaction 하나로 처리해 지갑 잔액과 거래 원장 합계가 항상 같게 만든다
// (AC-01). db는 concurrency.service.js와 같은 방식으로 테스트가 주입할 수 있게
// 마지막 인자로 받는다 — 기본값은 실제 backend/models다.
//
// 동시성(AC-01): purchaseItem은 지갑 행을 SELECT ... FOR UPDATE로 잠근 뒤에야 이미
// 보유 중인지 확인한다. 그래서 같은 계정으로 동시에 두 번 구매 요청이 들어와도(서로 다른
// 브라우저 = 서로 다른 referenceEventId) 두 번째 요청은 첫 번째 커밋이 끝나 잠금이
// 풀린 뒤에야 진행되고, 그 시점엔 이미 소유 중이라는 것을 보고 즉시 거부된다 — 잠금보다
// 먼저 소유 여부를 확인하면 이 보장이 깨진다.
//
// 재처리 방지(AC-02): reference_event_id는 economy_ledger_entries에 전역 유일 제약이
// 걸려 있다. 같은 참조 사건 ID로 재전송되면 먼저 가벼운 사전 조회로 거의 항상 잡아내고,
// 정말 동시에 들어와 사전 조회를 둘 다 통과한 경우에도 두 번째 INSERT가 유일 제약에서
// 실패해 이미 처리된 결과를 그대로 돌려준다(중복 지급 없음).

const {
    ITEM_TYPES,
    DEFAULT_PROFILE_PHOTO_ID,
    DEFAULT_PROFILE_BORDER_ID,
    getCatalogItem,
    listDefaultGrantItems,
} = require('../economy/catalog');
const { createError } = require('../utils/appError');

const FREE_CARD_FRAME_ID = 'player-card-베이스';

const SLOT_TO_ITEM_TYPE = {
    PROFILE_PHOTO: ITEM_TYPES.PROFILE_PHOTO,
    PROFILE_BORDER: ITEM_TYPES.PROFILE_BORDER,
    PLAYER_CARD_FRAME: ITEM_TYPES.PLAYER_CARD_FRAME,
};

const SLOT_TO_LOADOUT_COLUMN = {
    PROFILE_PHOTO: 'selected_profile_photo_id',
    PROFILE_BORDER: 'selected_profile_border_id',
    PLAYER_CARD_FRAME: 'selected_card_frame_id',
};

const economyModels = (db) => ({
    sequelize: db.sequelize,
    EconomyWallet: db.sequelize.models.EconomyWallet,
    EconomyLedgerEntry: db.EconomyLedgerEntry,
    EconomyEntitlement: db.sequelize.models.EconomyEntitlement,
    EconomyLoadout: db.sequelize.models.EconomyLoadout,
});

const defaultDb = () => require('../models');

/** 지갑 행이 없으면 잔액 0으로 만들어 둔다 — 잠금 트랜잭션 밖에서 미리 실행해, 잠금
 *  트랜잭션 안에서는 항상 SELECT ... FOR UPDATE만 하면 되게 한다. */
const ensureWalletRow = async (db, userId) => {
    const models = economyModels(db);
    try {
        await models.EconomyWallet.create({ user_id: userId, balance_gold: 0 });
    } catch (error) {
        if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
    }
};

/**
 * 지갑 잠금 → (필요하면) 소유 여부 확인 → 잔액 검증 → 지갑 갱신 → 원장 기록 →
 * (필요하면) 소유권 부여를 하나의 트랜잭션으로 실행한다. amount는 양수(지급)/음수(차감)
 * 모두 가능하다.
 */
const applyLedgerTransaction = async (db, {
    userId, reason, amount, itemId = null, itemType = null, referenceEventId, entitlementSource = null,
}) => {
    if (typeof referenceEventId !== 'string' || referenceEventId.length === 0) {
        throw createError('참조 사건 ID(referenceEventId)가 필요합니다.', 400, 'MISSING_REFERENCE_EVENT_ID');
    }
    if (!Number.isInteger(amount)) {
        throw createError('금액은 정수여야 합니다.', 400, 'INVALID_AMOUNT');
    }

    const models = economyModels(db);

    const preExisting = await models.EconomyLedgerEntry.findOne({ where: { reference_event_id: referenceEventId } });
    if (preExisting) {
        return { idempotent: true, ledgerEntry: preExisting };
    }

    await ensureWalletRow(db, userId);

    try {
        return await models.sequelize.transaction(async (t) => {
            const wallet = await models.EconomyWallet.findOne({
                where: { user_id: userId },
                transaction: t,
                lock: t.LOCK.UPDATE,
            });

            if (itemId) {
                const owned = await models.EconomyEntitlement.findOne({
                    where: { user_id: userId, item_id: itemId },
                    transaction: t,
                });
                if (owned) {
                    throw createError('이미 보유한 상품입니다.', 409, 'ITEM_ALREADY_OWNED');
                }
            }

            const newBalance = wallet.balance_gold + amount;
            if (newBalance < 0) {
                throw createError('잔액이 부족합니다.', 400, 'INSUFFICIENT_BALANCE');
            }

            await wallet.update({ balance_gold: newBalance }, { transaction: t });

            let ledgerEntry;
            try {
                ledgerEntry = await models.EconomyLedgerEntry.create({
                    user_id: userId,
                    reason,
                    item_id: itemId,
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

            return { idempotent: false, ledgerEntry, walletBalanceGold: newBalance };
        });
    } catch (error) {
        if (error?.code === 'DUPLICATE_REFERENCE_EVENT') {
            const existing = await models.EconomyLedgerEntry.findOne({ where: { reference_event_id: referenceEventId } });
            if (existing) return { idempotent: true, ledgerEntry: existing };
        }
        throw error;
    }
};

/** 선택값이 없는(null) 계정에만 금빛가면/평민 기본값을 채운다(A-04) — 기존 유효 선택은
 *  절대 덮어쓰지 않는다. */
const ensureDefaultLoadout = async (db, userId) => {
    const models = economyModels(db);
    const [loadout] = await models.EconomyLoadout.findOrCreate({
        where: { user_id: userId },
        defaults: { user_id: userId },
    });

    const patch = {};
    if (!loadout.selected_profile_photo_id) patch.selected_profile_photo_id = DEFAULT_PROFILE_PHOTO_ID;
    if (!loadout.selected_profile_border_id) patch.selected_profile_border_id = DEFAULT_PROFILE_BORDER_ID;
    if (Object.keys(patch).length > 0) await loadout.update(patch);

    return loadout;
};

/** 기본 프로필 16종 + 평민 테두리 1종을 중복 없이 지급한다(AC-03). 기존 계정·신규 계정
 *  모두 이 함수를 호출하는 경로(지갑 조회 등)를 타면 되므로, 별도의 가입 훅이 없어도
 *  두 경우 모두 커버된다. 이미 지급된 항목은 원장의 reference_event_id 유일 제약으로
 *  조용히 건너뛴다. */
const ensureDefaultEntitlements = async (userId, db = defaultDb()) => {
    for (const item of listDefaultGrantItems()) {
        const referenceEventId = `default-grant:${userId}:${item.id}`;
        try {
            await applyLedgerTransaction(db, {
                userId,
                reason: 'DEFAULT_GRANT',
                amount: 0,
                itemId: item.id,
                itemType: item.type,
                referenceEventId,
                entitlementSource: 'DEFAULT_GRANT',
            });
        } catch (error) {
            if (error?.code === 'ITEM_ALREADY_OWNED') continue;
            throw error;
        }
    }
    return ensureDefaultLoadout(db, userId);
};

/** 자기 계정의 지갑·소유품·장착 상태를 한 번에 돌려준다. 매 호출마다 기본 지급을
 *  보장해 신규·기존 계정을 같은 경로로 처리한다. */
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
        amount: row.amount,
        balanceAfter: row.balance_after,
        referenceEventId: row.reference_event_id,
        createdAt: row.created_at,
    }));
};

/** 클라이언트가 보낸 가격은 절대 읽지 않는다 — priceGold는 항상 카탈로그 조회값이다
 *  (AC-04). itemId가 카탈로그에 없거나 구매 불가 상품이면 즉시 거부한다. */
const purchaseItem = async ({ userId, itemId, referenceEventId }, db = defaultDb()) => {
    const catalogItem = getCatalogItem(itemId);
    if (!catalogItem || catalogItem.purchasable !== true) {
        throw createError('존재하지 않거나 구매할 수 없는 상품입니다.', 400, 'ITEM_NOT_PURCHASABLE');
    }

    return applyLedgerTransaction(db, {
        userId,
        reason: 'PURCHASE',
        amount: -catalogItem.priceGold,
        itemId: catalogItem.id,
        itemType: catalogItem.type,
        referenceEventId,
        entitlementSource: 'PURCHASE',
    });
};

/** QA/운영 보상 지급 — role 검사는 라우트 계층 책임이다. amountGold는 호출부(라우트)가
 *  서버 내부 정책으로 결정하는 값으로, 이 함수 자체는 일반 사용자 요청에서 직접
 *  호출되지 않는다. */
const grantReward = async ({ userId, amountGold, reason = 'REWARD', referenceEventId }, db = defaultDb()) => {
    if (!Number.isInteger(amountGold) || amountGold <= 0) {
        throw createError('amountGold는 1 이상의 정수여야 합니다.', 400, 'INVALID_AMOUNT');
    }
    return applyLedgerTransaction(db, { userId, reason, amount: amountGold, referenceEventId });
};

/** 소유권·아이템 종류를 검증한 뒤에만 장착한다(AC-05). itemId가 카탈로그에 없는
 *  임의 문자열(파일 경로 등)이면 ITEM_TYPE_MISMATCH로 거부되고, 카탈로그에 있어도
 *  보유하지 않았으면 ITEM_NOT_OWNED(403)로 거부된다. */
const equipItem = async ({ userId, slot, itemId }, db = defaultDb()) => {
    const expectedType = SLOT_TO_ITEM_TYPE[slot];
    const column = SLOT_TO_LOADOUT_COLUMN[slot];
    if (!expectedType || !column) {
        throw createError('알 수 없는 장착 슬롯입니다.', 400, 'UNKNOWN_EQUIP_SLOT');
    }
    if (typeof itemId !== 'string' || itemId.length === 0) {
        throw createError('itemId가 필요합니다.', 400, 'INVALID_ITEM_ID');
    }

    const isFreeCardFrame = slot === 'PLAYER_CARD_FRAME' && itemId === FREE_CARD_FRAME_ID;
    const models = economyModels(db);

    if (!isFreeCardFrame) {
        const catalogItem = getCatalogItem(itemId);
        if (!catalogItem || catalogItem.type !== expectedType) {
            throw createError('존재하지 않는 상품이거나 이 슬롯에 장착할 수 없는 종류입니다.', 400, 'ITEM_TYPE_MISMATCH');
        }

        const owned = await models.EconomyEntitlement.findOne({ where: { user_id: userId, item_id: itemId } });
        if (!owned) {
            throw createError('보유하지 않은 상품은 장착할 수 없습니다.', 403, 'ITEM_NOT_OWNED');
        }
    }

    const [loadout] = await models.EconomyLoadout.findOrCreate({
        where: { user_id: userId },
        defaults: { user_id: userId },
    });
    await loadout.update({ [column]: itemId });
    return loadout;
};

module.exports = {
    FREE_CARD_FRAME_ID,
    SLOT_TO_ITEM_TYPE,
    ensureDefaultEntitlements,
    getWalletSummary,
    listTransactions,
    purchaseItem,
    grantReward,
    equipItem,
    // 테스트 전용 — 낮은 레벨 원장 적용 로직을 직접 검증할 때 사용한다.
    __internal: { applyLedgerTransaction, ensureWalletRow, ensureDefaultLoadout },
};
