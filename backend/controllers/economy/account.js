// 경제 계정 처리기 파일, 지갑·소유품·거래 내역 읽기 + 장착 바꾸기(칸 하나·프로필 사진·테두리)
// routes/economy.routes.js가 부름 (본인 확인은 앞 미들웨어 몫, 경제 서비스는 모듈 객체로 불러 시험 갈아끼우기 먹게)
const { createError }  = require("../../utils/appError");
const economyService = require("../../services/economy");
const { ALLOWED_EQUIP_PROFILE_FIELDS, rejectUnknownFields } = require("../../validations/economy/fields");
const { serializeLoadout, serializeEquipLoadout } = require("./serializers");

// GET /accounts/:userId/wallet: 골드·다이아 잔액
exports.getWallet = async (req, res, next) => {
    try {
        const summary = await economyService.getWalletSummary(req.params.userId);
        res.json({ balanceGold: summary.balanceGold, balanceDiamond: summary.balanceDiamond });
    } catch (error) { next(error); }
};

// GET /accounts/:userId/entitlements: 소유품 · 장착
exports.getEntitlements = async (req, res, next) => {
    try {
        const summary = await economyService.getWalletSummary(req.params.userId);
        res.json({ entitlements: summary.entitlements, loadout: summary.loadout });
    } catch (error) { next(error); }
};

// GET /accounts/:userId/transactions: 거래 내역
exports.getTransactions = async (req, res, next) => {
    try {
        const transactions = await economyService.listTransactions(req.params.userId);
        res.json({ transactions });
    } catch (error) { next(error); }
};

// POST /equip: 칸 하나 장착 (검사 순서: 칸·아이템 → revision)
exports.equipItem = async (req, res, next) => {
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
};

// POST /equip-profile: 프로필 사진·테두리 장착 (검사 순서: 모르는 필드 → 사진 → 테두리 → revision)
exports.equipProfile = async (req, res, next) => {
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
};
