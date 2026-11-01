// 경제 경로 파일, /economy 아래 경로 + 미들웨어 줄 세우기만 (처리기는 controllers/economy)
// index.js가 /economy에 붙임, 경로 등록 순서 그대로 (GET /topup/orders가 /:orderId보다 앞)
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

router.get("/accounts/:userId/wallet",       verifyToken, requireSelf, getWallet);
router.get("/accounts/:userId/entitlements", verifyToken, requireSelf, getEntitlements);
router.get("/accounts/:userId/transactions", verifyToken, requireSelf, getTransactions);

router.post("/purchase",                    verifyToken, purchaseItem);
router.post("/purchases/bulk",              verifyToken, purchaseItems);
router.get("/purchases/:referenceEventId",  verifyToken, requireSelf, getPurchaseResult);
router.post("/gold-purchases",              verifyToken, requireSelf, purchaseGold);

router.post("/equip",         verifyToken, equipItem);
router.post("/equip-profile", verifyToken, equipProfile);

router.post("/admin/grant", verifyToken, requireEconomyAdmin, grantReward);

router.get("/currency-products",               verifyToken, requireSelf, listCurrencyProducts);
router.post("/topup/orders",                   verifyToken, requireSelf, createOrder);
router.post("/topup/orders/:orderId/confirm",  verifyToken, requireSelf, confirmOrder);
router.get("/topup/orders",                    verifyToken, requireSelf, listOpenOrders);
router.get("/topup/orders/:orderId",           verifyToken, requireSelf, getOrder);

module.exports = router;
