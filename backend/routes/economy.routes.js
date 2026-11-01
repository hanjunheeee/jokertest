const express = require("express");
const router  = express.Router();

const { verifyToken } = require("../middlewares/auth.middleware");
const { createError }  = require("../utils/appError");
const economyService = require("../services/economy");
const currencyProductsService = require("../services/economy/currencyProducts");
const topupService = require("../services/economy/topup");
const userRepository = require("../repositories/user.repositories");
const { getRewardCatalogEntry } = require("../economy/catalog");

const requireSelf = (req, res, next) => {
    const authenticatedUuid = req.user?.uuid;
    if (typeof authenticatedUuid !== "string" || authenticatedUuid.length === 0) {
        return next(createError("로그인이 필요합니다.", 401));
    }
    if (req.params.userId !== undefined && authenticatedUuid !== req.params.userId) {
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
    revision: loadout.revision,
});

const serializeEquipLoadout = (loadout) => ({
    ...serializeLoadout(loadout),
    selectedSkinsByJob: economyService.buildSkinsByJob(loadout),
});

const ALLOWED_PURCHASE_FIELDS = new Set(["itemId", "referenceEventId"]);
const ALLOWED_GRANT_FIELDS = new Set(["userId", "reason", "referenceEventId"]);
const ALLOWED_BULK_PURCHASE_FIELDS = new Set(["items", "referenceEventId"]);
const ALLOWED_BULK_PURCHASE_ITEM_FIELDS = new Set(["itemId"]);
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

router.post("/purchase", verifyToken, async (req, res, next) => {
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
});

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

router.get("/purchases/:referenceEventId", verifyToken, requireSelf, async (req, res, next) => {
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
});

const ALLOWED_GOLD_PURCHASE_FIELDS = new Set(["productId", "version", "referenceEventId"]);
const IGNORED_GOLD_PURCHASE_REFERENCE_FIELDS = ["price", "priceGold", "amount", "quantity", "payAmount", "grantAmount", "bonusAmount"];

router.post("/gold-purchases", verifyToken, requireSelf, async (req, res, next) => {
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
});

router.post("/equip", verifyToken, async (req, res, next) => {
    try {
        const { slot, itemId, expectedRevision } = req.body ?? {};
        if (typeof slot !== "string" || typeof itemId !== "string") {
            throw createError("slot과 itemId가 필요합니다.", 400, "INVALID_EQUIP_REQUEST");
        }
        if (typeof expectedRevision !== "string" || expectedRevision.length === 0) {
            throw createError("expectedRevision이 필요합니다.", 400, "MISSING_EXPECTED_REVISION");
        }
        const loadout = await economyService.equipItem({ userId: req.user.uuid, slot, itemId, expectedRevision });
        res.json({ loadout: serializeEquipLoadout(loadout) });
    } catch (error) { next(error); }
});

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

const ALLOWED_TOPUP_ORDER_FIELDS = new Set(["productId", "version"]);
const ALLOWED_TOPUP_CONFIRM_FIELDS = new Set(["paymentKey", "amount"]);
const PRODUCT_KINDS = new Set(["DIAMOND_TOPUP", "GOLD_PURCHASE"]);

const isPositiveSafeInteger = (value) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const serializePublicProduct = (product) => ({
    productId: product.productId,
    kind: product.kind,
    displayName: product.displayName,
    payCurrency: product.payCurrency,
    payAmount: product.payAmount,
    grantCurrency: product.grantCurrency,
    grantAmount: product.grantAmount,
    bonusAmount: product.bonusAmount,
    version: product.version,
});

const serializeTopupOrder = (order) => ({
    ok: true,
    orderId: order.orderId,
    status: order.status,
    amount: order.amount,
    orderName: order.orderName,
    productId: order.productId,
    version: order.version,
    grantAmount: order.grantAmount,
    bonusAmount: order.bonusAmount,
    ...(order.status === "GRANTED" ? { balanceDiamond: order.balanceDiamond } : {}),
    createdAt: order.createdAt,
});

router.get("/currency-products", verifyToken, requireSelf, async (req, res, next) => {
    try {
        const { kind } = req.query;
        if (kind !== undefined && (typeof kind !== "string" || !PRODUCT_KINDS.has(kind))) {
            throw createError("알 수 없는 상품 종류입니다.", 400, "INVALID_PRODUCT_KIND");
        }
        const products = await currencyProductsService.listCurrencyProducts({ kind });
        res.json({ ok: true, products: products.map(serializePublicProduct) });
    } catch (error) { next(error); }
});

router.post("/topup/orders", verifyToken, requireSelf, async (req, res, next) => {
    try {
        const body = req.body ?? {};
        rejectUnknownFields(body, ALLOWED_TOPUP_ORDER_FIELDS, "UNKNOWN_TOPUP_ORDER_FIELD");
        const { productId, version } = body;
        if (typeof productId !== "string" || productId.length === 0 || productId.length > 64 || !isPositiveSafeInteger(version)) {
            throw createError("productId와 version이 필요합니다.", 400, "INVALID_TOPUP_ORDER_REQUEST");
        }
        const order = await topupService.createTopupOrder({ userId: req.user.uuid, productId, version });
        res.status(201).json({
            ok: true,
            orderId: order.orderId,
            amount: order.amount,
            orderName: order.orderName,
            clientKey: order.clientKey,
        });
    } catch (error) { next(error); }
});

router.post("/topup/orders/:orderId/confirm", verifyToken, requireSelf, async (req, res, next) => {
    try {
        const body = req.body ?? {};
        rejectUnknownFields(body, ALLOWED_TOPUP_CONFIRM_FIELDS, "UNKNOWN_TOPUP_CONFIRM_FIELD");
        const { paymentKey, amount } = body;
        if (typeof paymentKey !== "string" || paymentKey.length === 0 || paymentKey.length > 200 || !isPositiveSafeInteger(amount)) {
            throw createError("paymentKey와 amount가 필요합니다.", 400, "INVALID_TOPUP_CONFIRM_REQUEST");
        }
        const result = await topupService.confirmTopupOrder({
            userId: req.user.uuid, orderId: req.params.orderId, paymentKey, amount,
        });
        if (result.status === "GRANTED") {
            res.json({ ok: true, status: "GRANTED", balanceDiamond: result.balanceDiamond });
        } else {
            res.json({ ok: true, status: "PENDING_GRANT" });
        }
    } catch (error) { next(error); }
});

router.get("/topup/orders", verifyToken, requireSelf, async (req, res, next) => {
    try {
        if (req.query.state !== "open") {
            throw createError("state=open이 필요합니다.", 400, "INVALID_TOPUP_ORDER_REQUEST");
        }
        const orders = await topupService.listOpenTopupOrders({ userId: req.user.uuid });
        res.set("Cache-Control", "no-store");
        res.json({
            ok: true,
            orders: orders.map((order) => ({
                orderId: order.orderId,
                status: order.status,
                amount: order.amount,
                orderName: order.orderName,
                createdAt: order.createdAt,
            })),
        });
    } catch (error) { next(error); }
});

router.get("/topup/orders/:orderId", verifyToken, requireSelf, async (req, res, next) => {
    try {
        const order = await topupService.getTopupOrder({ userId: req.user.uuid, orderId: req.params.orderId });
        res.json(serializeTopupOrder(order));
    } catch (error) { next(error); }
});

module.exports = router;
