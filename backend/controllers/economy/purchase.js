// 경제 구매 처리기 파일, 상점 구매(하나·묶음·결과 조회·골드) + 관리자 보상 지급
// routes/economy.routes.js가 부름 (지급 권한은 앞 미들웨어 몫, 경제 서비스는 모듈 객체로 불러 시험 갈아끼우기 먹게)
const { createError }  = require("../../utils/appError");
const economyService = require("../../services/economy");
const { getRewardCatalogEntry } = require("../../services/economy/catalog");
const {
    ALLOWED_PURCHASE_FIELDS,
    ALLOWED_GRANT_FIELDS,
    ALLOWED_BULK_PURCHASE_FIELDS,
    ALLOWED_BULK_PURCHASE_ITEM_FIELDS,
    ALLOWED_GOLD_PURCHASE_FIELDS,
    IGNORED_GOLD_PURCHASE_REFERENCE_FIELDS,
    rejectUnknownFields,
    isPositiveSafeInteger,
} = require("../../validations/economy/fields");
const { serializeLedgerEntry } = require("./serializers");

// POST /purchase: 아이템 하나 구매 (새로 사면 201, 같은 참조 id 다시 오면 200)
exports.purchaseItem = async (req, res, next) => {
    try {
        const body = req.body ?? {};
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
};

// POST /purchases/bulk: 묶음 구매 (검사 순서: 모르는 필드 → 참조 id → items → 항목마다 필드·itemId)
exports.purchaseItems = async (req, res, next) => {
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
};

// GET /purchases/:referenceEventId: 커밋된 구매 결과 (없으면 404, 골드 구매면 잔액까지)
exports.getPurchaseResult = async (req, res, next) => {
    try {
        const result = await economyService.getPurchaseResult(req.user.uuid, req.params.referenceEventId);
        if (!result) {
            throw createError("해당 참조 사건 ID로 커밋된 구매 결과가 없습니다.", 404, "PURCHASE_RESULT_NOT_FOUND");
        }
        const body = { kind: result.kind, results: result.results.map(serializeLedgerEntry), createdAt: result.createdAt };
        if (result.kind === "GOLD") {
            const diamondEntry = result.results.find((entry) => entry.currency === "DIAMOND");
            const goldEntry = result.results.find((entry) => entry.currency === "GOLD");
            Object.assign(body, {
                ok: true,
                balanceDiamond: diamondEntry?.balance_after,
                balanceGold: goldEntry?.balance_after,
            });
        }
        res.json(body);
    } catch (error) { next(error); }
};

// POST /gold-purchases: 다이아로 골드 구매 (참고용 필드 지운 뒤 모르는 필드 검사)
exports.purchaseGold = async (req, res, next) => {
    try {
        const body = { ...(req.body ?? {}) };
        for (const field of IGNORED_GOLD_PURCHASE_REFERENCE_FIELDS) delete body[field];
        rejectUnknownFields(body, ALLOWED_GOLD_PURCHASE_FIELDS, "UNKNOWN_GOLD_PURCHASE_FIELD");
        const { productId, version, referenceEventId } = body;
        if (typeof productId !== "string" || productId.length === 0 || productId.length > 64
            || !isPositiveSafeInteger(version)
            || typeof referenceEventId !== "string" || referenceEventId.length === 0 || referenceEventId.length > 150) {
            throw createError("productId·version·referenceEventId가 필요합니다.", 400, "INVALID_GOLD_PURCHASE_REQUEST");
        }
        const result = await economyService.purchaseGold({ userId: req.user.uuid, productId, version, referenceEventId });
        res.status(200).json({ ok: true, balanceGold: result.balanceGold, balanceDiamond: result.balanceDiamond });
    } catch (error) { next(error); }
};

// POST /admin/grant: 관리자 보상 지급 (금액·통화는 서버 보상 카탈로그 값만)
exports.grantReward = async (req, res, next) => {
    try {
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
};
