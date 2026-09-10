const express = require("express");
const router  = express.Router();

const { verifyToken } = require("../middleware/auth.middleware");
const { createError }  = require("../utils/appError");
const economyService = require("../service/economy.service");
const userRepository = require("../repositories/user.repositories");

// 자기 계정 데이터만 조회할 수 있다(F-08 AC-06). verifyToken이 채운 req.user.uuid와
// URL의 :userId가 다르면 401이 아니라 403이다 — 토큰 자체는 유효하지만 그 토큰의
// 권한 범위를 벗어난 요청이기 때문이다.
const requireSelf = (req, res, next) => {
    if (req.user.uuid !== req.params.userId) {
        return next(createError("다른 계정의 경제 데이터에 접근할 수 없습니다.", 403, "ECONOMY_FORBIDDEN"));
    }
    next();
};

const serializeLedgerEntry = (entry) => entry && ({
    id: entry.id,
    reason: entry.reason,
    itemId: entry.item_id,
    currency: entry.currency,
    amount: entry.amount,
    balanceAfter: entry.balance_after,
    referenceEventId: entry.reference_event_id,
    createdAt: entry.created_at,
});

const serializeLoadout = (loadout) => ({
    selectedProfilePhotoId: loadout.selected_profile_photo_id,
    selectedProfileBorderId: loadout.selected_profile_border_id,
    selectedCardFrameId: loadout.selected_card_frame_id,
});

router.get("/accounts/:userId/wallet", verifyToken, requireSelf, async (req, res, next) => {
    try {
        const summary = await economyService.getWalletSummary(req.params.userId);
        res.json({ balanceGold: summary.balanceGold, balanceDiamond: summary.balanceDiamond });
    } catch (error) { next(error); }
});

router.get("/accounts/:userId/entitlements", verifyToken, requireSelf, async (req, res, next) => {
    try {
        const summary = await economyService.getWalletSummary(req.params.userId);
        res.json({ entitlements: summary.entitlements, loadout: summary.loadout });
    } catch (error) { next(error); }
});

router.get("/accounts/:userId/transactions", verifyToken, requireSelf, async (req, res, next) => {
    try {
        const transactions = await economyService.listTransactions(req.params.userId);
        res.json({ transactions });
    } catch (error) { next(error); }
});

// 구매·장착은 URL에 계정을 받지 않는다 — 항상 인증된 본인(req.user.uuid) 기준으로만
// 처리하므로 다른 계정을 대상으로 지정할 방법 자체가 없다.
router.post("/purchase", verifyToken, async (req, res, next) => {
    try {
        const { itemId, referenceEventId } = req.body ?? {};
        if (typeof itemId !== "string" || typeof referenceEventId !== "string") {
            throw createError("itemId와 referenceEventId가 필요합니다.", 400, "INVALID_PURCHASE_REQUEST");
        }
        // 클라이언트가 함께 보낼 수 있는 price·balance 등 다른 필드는 절대 읽지 않는다
        // (F-08 AC-04) — economyService.purchaseItem은 서버 카탈로그 가격만 신뢰한다.
        const result = await economyService.purchaseItem({ userId: req.user.uuid, itemId, referenceEventId });
        res.status(result.idempotent ? 200 : 201).json({
            idempotent: result.idempotent,
            ledgerEntry: serializeLedgerEntry(result.ledgerEntry),
        });
    } catch (error) { next(error); }
});

router.post("/equip", verifyToken, async (req, res, next) => {
    try {
        const { slot, itemId } = req.body ?? {};
        if (typeof slot !== "string" || typeof itemId !== "string") {
            throw createError("slot과 itemId가 필요합니다.", 400, "INVALID_EQUIP_REQUEST");
        }
        const loadout = await economyService.equipItem({ userId: req.user.uuid, slot, itemId });
        res.json({ loadout: serializeLoadout(loadout) });
    } catch (error) { next(error); }
});

// QA/운영 보상 지급 — role이 ADMIN·QA인 계정만 사용할 수 있다. req.user.role은 로그인
// 시점에 JWT에 실린 값이라, 그 이후 권한이 바뀌어도(예: QA 권한 회수) 세션이 만료되기
// 전까지는 갱신되지 않는다 — 이 경로처럼 민감한 관리자 전용 기능은 req.user.role을
// 그대로 믿지 않고, 매 요청마다 실제 계정 행(userRepository.findByUuid)을 다시 읽어
// "지금 이 순간" 실제 서버 계정 데이터에 저장된 권한으로 판정한다(F-08 R-IMPL: "Existing
// permission identity must be verified from real server session/account data"). amount·
// currency는 요청 본문이 정하지만, 이 경로 자체가 일반 유저 요청 표면이 아니라 운영
// 전용이라 AC-04의 "클라이언트 값을 그대로 신뢰하지 않는다"는 일반 구매/장착 경로에는
// 적용되지만 이 관리자 경로에는 해당하지 않는다.
router.post("/admin/grant", verifyToken, async (req, res, next) => {
    try {
        const actingAccount = await userRepository.findByUuid(req.user.uuid);
        if (!actingAccount || (actingAccount.role !== "ADMIN" && actingAccount.role !== "QA")) {
            throw createError("권한이 없습니다.", 403, "ECONOMY_ADMIN_ONLY");
        }
        const { userId, amount, currency, reason, referenceEventId } = req.body ?? {};
        if (typeof userId !== "string" || typeof referenceEventId !== "string") {
            throw createError("userId와 referenceEventId가 필요합니다.", 400, "INVALID_GRANT_REQUEST");
        }
        const result = await economyService.grantReward({ userId, amount, currency, reason, referenceEventId });
        res.status(result.idempotent ? 200 : 201).json({
            idempotent: result.idempotent,
            ledgerEntry: serializeLedgerEntry(result.ledgerEntry),
        });
    } catch (error) { next(error); }
});

module.exports = router;
