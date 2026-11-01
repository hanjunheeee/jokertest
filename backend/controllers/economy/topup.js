// 경제 충전 처리기 파일, 재화 상품 목록 + 다이아 충전 주문(만들기·승인·열린 주문·주문 하나)
// routes/economy.routes.js가 부름 (본인 확인은 앞 미들웨어 몫, 서비스는 모듈 객체로 불러 시험 갈아끼우기 먹게)
const { createError }  = require("../../utils/appError");
const currencyProductsService = require("../../services/economy/currencyProducts");
const topupService = require("../../services/economy/topup");
const {
    ALLOWED_TOPUP_ORDER_FIELDS,
    ALLOWED_TOPUP_CONFIRM_FIELDS,
    PRODUCT_KINDS,
    rejectUnknownFields,
    isPositiveSafeInteger,
} = require("../../validations/economy");
const { serializePublicProduct, serializeTopupOrder } = require("./serializers");

// GET /currency-products: 판매 중 상품 목록 (kind 있으면 아는 종류만)
exports.listCurrencyProducts = async (req, res, next) => {
    try {
        const { kind } = req.query;
        if (kind !== undefined && (typeof kind !== "string" || !PRODUCT_KINDS.has(kind))) {
            throw createError("알 수 없는 상품 종류입니다.", 400, "INVALID_PRODUCT_KIND");
        }
        const products = await currencyProductsService.listCurrencyProducts({ kind });
        res.json({ ok: true, products: products.map(serializePublicProduct) });
    } catch (error) { next(error); }
};

// POST /topup/orders: 충전 주문 만들기 (201)
exports.createOrder = async (req, res, next) => {
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
};

// POST /topup/orders/:orderId/confirm: 결제 승인 → 지급 끝났으면 잔액, 아니면 지급 대기
exports.confirmOrder = async (req, res, next) => {
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
};

// GET /topup/orders?state=open: 열린 주문 목록 (캐시 안 함)
exports.listOpenOrders = async (req, res, next) => {
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
};

// GET /topup/orders/:orderId: 주문 하나
exports.getOrder = async (req, res, next) => {
    try {
        const order = await topupService.getTopupOrder({ userId: req.user.uuid, orderId: req.params.orderId });
        res.json(serializeTopupOrder(order));
    } catch (error) { next(error); }
};
