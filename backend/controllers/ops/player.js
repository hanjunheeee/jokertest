// 사용자 운영 처리기 파일, 쿠폰 사용 · 신고 접수 (둘 다 로그인한 본인 uuid로만)
// routes/economy.routes.js(쿠폰)·routes/report.routes.js(신고)가 부름, 서비스는 모듈 객체로 불러 시험 갈아끼우기 먹게
const couponService = require("../../services/ops/coupon");
const reportService = require("../../services/ops/report");

// POST /economy/coupons/redeem: 본문 { code }만 받음
exports.redeemCoupon = async (req, res, next) => {
    try {
        const result = await couponService.redeemCoupon({ userId: req.user.uuid, code: req.body?.code });
        res.status(201).json({ ok: true, ...result });
    } catch (error) { next(error); }
};

// POST /reports: 본문 { targetUuid, gameId, reasonCode, memo? }
exports.submitReport = async (req, res, next) => {
    try {
        const result = await reportService.submitReport({ reporterId: req.user.uuid, body: req.body });
        res.status(201).json({ ok: true, reportId: result.reportId });
    } catch (error) { next(error); }
};
