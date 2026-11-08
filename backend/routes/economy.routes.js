// 경제 경로 파일, /economy 아래 경로 + 미들웨어 줄 세우기만 (처리기는 controllers/economy)
// index.js가 /economy에 붙임, 전부 로그인 필요 (이모티콘 팔레트만 routes/user.routes.js 쪽)
const express = require("express");
const router  = express.Router();

const { verifyToken } = require("../middlewares/auth.middleware");
const { requireSelf,
        requireEconomyAdmin } = require("../middlewares/economyAccess.middleware");
const { getWallet,
        getEntitlements,
        getTransactions,
        equipItem,
        equipProfile }        = require("../controllers/economy/account");
const { purchaseItem,
        purchaseItems,
        getPurchaseResult,
        purchaseGold,
        grantReward }         = require("../controllers/economy/purchase");
const { listCurrencyProducts,
        createOrder,
        confirmOrder,
        listOpenOrders,
        getOrder }            = require("../controllers/economy/topup");
const { createRateLimiter } = require("../middlewares/rateLimit.middleware");
const playerOpsController   = require("../controllers/ops/player");

// 계정 읽기: 경로 userId가 로그인한 본인일 때만
router.get("/accounts/:userId/wallet",       verifyToken, requireSelf, getWallet);
router.get("/accounts/:userId/entitlements", verifyToken, requireSelf, getEntitlements);
router.get("/accounts/:userId/transactions", verifyToken, requireSelf, getTransactions);

// 구매·장착은 로그인 uuid로만 처리 (본문에 계정 id 안 받음)
router.post("/purchase",                    verifyToken, purchaseItem);
router.post("/purchases/bulk",              verifyToken, purchaseItems);
router.get("/purchases/:referenceEventId",  verifyToken, requireSelf, getPurchaseResult);
router.post("/gold-purchases",              verifyToken, requireSelf, purchaseGold);

router.post("/equip",         verifyToken, equipItem);
router.post("/equip-profile", verifyToken, equipProfile);

// 관리자 보상 지급: DB 계정 role 확인 뒤에만
router.post("/admin/grant", verifyToken, requireEconomyAdmin, grantReward);

// 쿠폰 사용: 로그인 uuid로만, 한 사람 1분에 10번 (틀린 코드 마구 넣기 막기)
const couponRateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    keyOf: (req) => `coupon:${req.user.uuid}`,
    message: "쿠폰 입력이 너무 많습니다. 잠시 후 다시 시도해주세요.",
});
// 같은 ip 10분 30번 (계정 여러 개로 쿠폰 번호 맞히기 막기, 보안 점검 2026-11-09)
const couponIpRateLimit = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 30,
    keyOf: (req) => `coupon-ip:${req.ip}`,
    message: "쿠폰 입력이 너무 많습니다. 잠시 후 다시 시도해주세요.",
});
router.post("/coupons/redeem", verifyToken, couponRateLimit, couponIpRateLimit, playerOpsController.redeemCoupon);

// 재화 상품·다이아 충전 주문 (오류 응답 모양은 errorHandler 충전 범위가 정함)
router.get("/currency-products",               verifyToken, requireSelf, listCurrencyProducts);
router.post("/topup/orders",                   verifyToken, requireSelf, createOrder);
router.post("/topup/orders/:orderId/confirm",  verifyToken, requireSelf, confirmOrder);
router.get("/topup/orders",                    verifyToken, requireSelf, listOpenOrders);
router.get("/topup/orders/:orderId",           verifyToken, requireSelf, getOrder);

module.exports = router;
