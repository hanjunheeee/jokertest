const express = require("express");
const router  = express.Router();

const { verifyToken } = require("../middleware/auth.middleware");
const { createError }  = require("../utils/appError");
const economyService = require("../service/economy.service");
const userRepository = require("../repositories/user.repositories");
const { getRewardCatalogEntry } = require("../economy/catalog");

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
    // F-13 AC-02: 다음 equip-profile 호출에 expectedRevision으로 그대로 되돌아올 CAS 토큰.
    revision: loadout.revision,
});

// CODEX-2 재검토(AC-04): 이전 버전은 req.body에서 문서화된 필드만 "골라 읽어" 서비스로
// 넘겼을 뿐, price·balance·amount·currency 같은 다른 필드가 함께 와도 조용히 무시하고
// 201을 돌려줬다 — "무시"는 "거부"가 아니다. 변조 필드가 하나라도 있으면 서비스/DB를
// 건드리기 전에 즉시 400으로 거부한다. Object.keys는 자체 열거 가능 속성만 보므로
// (own-property), express.json()이 만든 일반 객체에서 __proto__ 같은 키가 실려 와도
// 여기서 평범한 미지 필드로 그대로 잡힌다.
const ALLOWED_PURCHASE_FIELDS = new Set(["itemId", "referenceEventId"]);
const ALLOWED_GRANT_FIELDS = new Set(["userId", "reason", "referenceEventId"]);
// F-09 일괄 구매 — 같은 이유(AC-04)로 문서화된 필드(items·referenceEventId) 밖의 값이
// 오면 즉시 거부한다. items 배열의 각 원소도 itemId 하나만 허용한다 — 조작된 요청이
// item마다 price·currency 같은 필드를 끼워 넣어도 서비스에 닿기 전에 거부된다.
const ALLOWED_BULK_PURCHASE_FIELDS = new Set(["items", "referenceEventId"]);
const ALLOWED_BULK_PURCHASE_ITEM_FIELDS = new Set(["itemId"]);
// F-13(AC-01/AC-02): 프로필 사진·테두리 동시 확정 전용 필드. photoItemId/borderItemId
// 외의 값이 오면 즉시 거부한다(다른 write 라우트와 같은 관례, CODEX-2 재검토). clientIntentAt
// (클라이언트 벽시계 시각을 서버 순서 판정 근거로 쓰던 필드)은 운영자 설계 감사(2026-09-11)
// 로 제거했다 — economyService.equipProfileAppearance의 새 주석 참고(같은 밀리초 충돌·시계
// 역행/오차·비영속 인메모리 상태라는 세 가지 결함이 있었다). 그 대체로 서버가 발급하는
// 영속 revision을 CAS로 비교하는 expectedRevision을 새로 추가했다(운영자 지시, 2026-09-11
// 22:12) — 클라이언트가 GET 응답의 loadout.revision을 그대로 되돌려 보낸다.
const ALLOWED_EQUIP_PROFILE_FIELDS = new Set(["photoItemId", "borderItemId", "expectedRevision"]);

const rejectUnknownFields = (body, allowedFields, errorCode) => {
    const unknown = Object.keys(body ?? {}).filter((key) => !allowedFields.has(key));
    if (unknown.length > 0) {
        throw createError("허용되지 않은 필드가 포함되어 있습니다.", 400, errorCode);
    }
};

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
        const body = req.body ?? {};
        // 클라이언트가 price·balance 등 다른 필드를 함께 보내면 무시하는 대신 즉시 거부한다
        // (F-08 AC-04, CODEX-2 재검토) — economyService.purchaseItem은 서버 카탈로그 가격만
        // 신뢰하지만, 변조 필드가 조용히 무시되는 것과 요청 자체가 거부되는 것은 다르다.
        rejectUnknownFields(body, ALLOWED_PURCHASE_FIELDS, "UNKNOWN_PURCHASE_FIELD");
        const { itemId, referenceEventId } = body;
        if (typeof itemId !== "string" || typeof referenceEventId !== "string") {
            throw createError("itemId와 referenceEventId가 필요합니다.", 400, "INVALID_PURCHASE_REQUEST");
        }
        const result = await economyService.purchaseItem({ userId: req.user.uuid, itemId, referenceEventId });
        res.status(result.idempotent ? 200 : 201).json({
            idempotent: result.idempotent,
            ledgerEntry: serializeLedgerEntry(result.ledgerEntry),
        });
    } catch (error) { next(error); }
});

// F-09 일괄 구매 — 개별 구매(POST /purchase)와 같은 인증된 본인 계정 기준 원자적 처리다
// (economyService.purchaseItems). 하나라도 실패하면 묶음 전체가 실패한다(AC-02).
router.post("/purchases/bulk", verifyToken, async (req, res, next) => {
    try {
        const body = req.body ?? {};
        rejectUnknownFields(body, ALLOWED_BULK_PURCHASE_FIELDS, "UNKNOWN_BULK_PURCHASE_FIELD");
        const { items, referenceEventId } = body;
        if (typeof referenceEventId !== "string") {
            throw createError("referenceEventId가 필요합니다.", 400, "INVALID_BULK_PURCHASE_REQUEST");
        }
        if (!Array.isArray(items) || items.length === 0) {
            throw createError("items가 필요합니다.", 400, "INVALID_BULK_PURCHASE_REQUEST");
        }
        for (const item of items) {
            rejectUnknownFields(item, ALLOWED_BULK_PURCHASE_ITEM_FIELDS, "UNKNOWN_BULK_PURCHASE_ITEM_FIELD");
            if (typeof item?.itemId !== "string") {
                throw createError("items[].itemId가 필요합니다.", 400, "INVALID_BULK_PURCHASE_REQUEST");
            }
        }
        const result = await economyService.purchaseItems({ userId: req.user.uuid, items, referenceEventId });
        res.status(result.idempotent ? 200 : 201).json({
            idempotent: result.idempotent,
            kind: result.kind,
            results: result.results.map(serializeLedgerEntry),
        });
    } catch (error) { next(error); }
});

// F-09 AC-04 — 커밋 후 응답을 잃어버렸을 때 같은 참조 사건 ID로 결과를 복구한다.
// 커밋된 적이 없으면(요청이 아예 도달하지 않았거나 커밋 전 오류로 롤백됨) 404다 — 그
// 두 경우를 이 응답 하나로는 구분하지 않는다(economyService.getPurchaseResult 참고).
router.get("/purchases/:referenceEventId", verifyToken, async (req, res, next) => {
    try {
        const result = await economyService.getPurchaseResult(req.user.uuid, req.params.referenceEventId);
        if (!result) {
            throw createError("해당 참조 사건 ID로 커밋된 구매 결과가 없습니다.", 404, "PURCHASE_RESULT_NOT_FOUND");
        }
        res.json({ kind: result.kind, results: result.results.map(serializeLedgerEntry), createdAt: result.createdAt });
    } catch (error) { next(error); }
});

// F-14(AC-01, R-IMPL P1 "coherent persisted write ordering") — expectedRevision은 선택
// 필드다: 클라이언트가 GET 응답의 loadout.revision을 그대로 되돌려 보내면 서버가 CAS로
// 비교해(economyService.equipItem 참고) 지연·역전된 요청이 더 최신 저장을 덮어쓰지 못하게
// 막는다 — POST /economy/equip-profile의 expectedRevision과 정확히 같은 계약이다.
router.post("/equip", verifyToken, async (req, res, next) => {
    try {
        const { slot, itemId, expectedRevision } = req.body ?? {};
        if (typeof slot !== "string" || typeof itemId !== "string") {
            throw createError("slot과 itemId가 필요합니다.", 400, "INVALID_EQUIP_REQUEST");
        }
        if (expectedRevision !== undefined && typeof expectedRevision !== "string") {
            throw createError("expectedRevision은 문자열이어야 합니다.", 400, "INVALID_EQUIP_REQUEST");
        }
        const loadout = await economyService.equipItem({ userId: req.user.uuid, slot, itemId, expectedRevision });
        res.json({ loadout: serializeLoadout(loadout) });
    } catch (error) { next(error); }
});

// F-13 AC-01/AC-02: 프로필 수정 모달의 확인 한 번을 하나의 요청으로 확정한다. 사진·테두리
// 중 실제로 바뀐 슬롯만 보내면 되고(둘 다 보내도 된다), 어느 한쪽이 소유하지 않은 상품이면
// 두 슬롯 모두 저장되지 않는다(economyService.equipProfileAppearance의 전부-아니면-무 계약).
router.post("/equip-profile", verifyToken, async (req, res, next) => {
    try {
        const body = req.body ?? {};
        rejectUnknownFields(body, ALLOWED_EQUIP_PROFILE_FIELDS, "UNKNOWN_EQUIP_PROFILE_FIELD");
        const { photoItemId, borderItemId, expectedRevision } = body;
        if (photoItemId !== undefined && typeof photoItemId !== "string") {
            throw createError("photoItemId는 문자열이어야 합니다.", 400, "INVALID_EQUIP_PROFILE_REQUEST");
        }
        if (borderItemId !== undefined && typeof borderItemId !== "string") {
            throw createError("borderItemId는 문자열이어야 합니다.", 400, "INVALID_EQUIP_PROFILE_REQUEST");
        }
        if (typeof expectedRevision !== "string" || expectedRevision.length === 0) {
            throw createError("expectedRevision이 필요합니다.", 400, "MISSING_EXPECTED_REVISION");
        }
        const loadout = await economyService.equipProfileAppearance({
            userId: req.user.uuid,
            photoItemId,
            borderItemId,
            expectedRevision,
        });
        res.json({ loadout: serializeLoadout(loadout) });
    } catch (error) { next(error); }
});

// QA/운영 보상 지급 — role이 ADMIN·QA인 계정만 사용할 수 있다. req.user.role은 로그인
// 시점에 JWT에 실린 값이라, 그 이후 권한이 바뀌어도(예: QA 권한 회수) 세션이 만료되기
// 전까지는 갱신되지 않는다 — 이 경로처럼 민감한 관리자 전용 기능은 req.user.role을
// 그대로 믿지 않고, 매 요청마다 실제 계정 행(userRepository.findByUuid)을 다시 읽어
// "지금 이 순간" 실제 서버 계정 데이터에 저장된 권한으로 판정한다(F-08 R-IMPL: "Existing
// permission identity must be verified from real server session/account data").
//
// R-IMPL(2026-09-10, AC-04 재검토): 이전 버전은 요청 본문의 amount·currency를 그대로
// grantReward에 넘겼다 — 인증된 QA/ADMIN이라 해도 그 값은 여전히 "클라이언트가 보낸 값"
// 이므로, purchaseItem이 클라이언트 price를 절대 읽지 않는 것과 같은 이유로 여기서도
// 신뢰하면 안 된다. 이제 클라이언트는 amount·currency 대신 reason(보상 카탈로그의 키)만
// 보내고, 실제 지급 금액·재화는 항상 backend/economy/catalog.js의 REWARD_CATALOG 값이다
// — reason이 카탈로그에 없으면 요청 자체를 거부한다.
//
// CODEX-2 재검토(AC-04): reason만 읽고 amount·currency·balance 등 나머지 필드는 조용히
// 무시하던 이전 버전은 "변조 요청 거부"가 아니었다 — 문서화된 필드(userId/reason/
// referenceEventId) 밖의 값이 하나라도 오면 grantReward를 호출하기 전에 즉시 400으로
// 거부한다.
router.post("/admin/grant", verifyToken, async (req, res, next) => {
    try {
        const actingAccount = await userRepository.findByUuid(req.user.uuid);
        if (!actingAccount || (actingAccount.role !== "ADMIN" && actingAccount.role !== "QA")) {
            throw createError("권한이 없습니다.", 403, "ECONOMY_ADMIN_ONLY");
        }
        const body = req.body ?? {};
        rejectUnknownFields(body, ALLOWED_GRANT_FIELDS, "UNKNOWN_GRANT_FIELD");
        const { userId, reason, referenceEventId } = body;
        if (typeof userId !== "string" || typeof referenceEventId !== "string") {
            throw createError("userId와 referenceEventId가 필요합니다.", 400, "INVALID_GRANT_REQUEST");
        }
        const rewardEntry = typeof reason === "string" ? getRewardCatalogEntry(reason) : undefined;
        if (!rewardEntry) {
            throw createError("존재하지 않는 보상 사유입니다.", 400, "UNKNOWN_REWARD_REASON");
        }
        const result = await economyService.grantReward({
            userId,
            amount: rewardEntry.amount,
            currency: rewardEntry.currency,
            reason,
            referenceEventId,
        });
        res.status(result.idempotent ? 200 : 201).json({
            idempotent: result.idempotent,
            ledgerEntry: serializeLedgerEntry(result.ledgerEntry),
        });
    } catch (error) { next(error); }
});

module.exports = router;
