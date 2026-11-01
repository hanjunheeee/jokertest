// 경제 경로 권한 미들웨어 파일, 본인 확인(requireSelf) · 관리자 지급 권한(requireEconomyAdmin)
// routes/economy.routes.js가 verifyToken 뒤에 둠 (계정 role은 services/user.js로 읽음)
const { createError } = require("../utils/appError");
const userService     = require("../services/user");

// 남의 지갑·소유품·거래 내역 못 보게 막기 (경로에 userId 없으면 로그인만 봄)
const requireSelf = (req, res, next) => {
    // 토큰에 uuid 없으면 로그인 안 한 걸로 봄
    const authenticatedUuid = req.user?.uuid;
    if (typeof authenticatedUuid !== "string" || authenticatedUuid.length === 0) {
        return next(createError("로그인이 필요합니다.", 401));
    }
    // 경로 계정이 본인이 아니면 403
    if (req.params.userId !== undefined && authenticatedUuid !== req.params.userId) {
        return next(createError("다른 계정의 경제 데이터에 접근할 수 없습니다.", 403, "ECONOMY_FORBIDDEN"));
    }
    next();
};

// 관리자 보상 지급 권한: DB 계정 role이 ADMIN·QA일 때만 통과 (토큰 role 말고 지금 DB 값 봄)
// next()는 try 밖 (처리기에서 난 오류가 다시 catch로 와서 next 두 번 부르는 일 막기)
const requireEconomyAdmin = async (req, res, next) => {
    let actingAccount;
    try {
        actingAccount = await userService.findByUuid(req.user.uuid);
    } catch (error) {
        // 빈 값 오류여도 지급 처리기로 안 넘어가게 이 경로 건너뜀 ('route')
        return next(error || "route");
    }
    // 계정 못 찾아도 권한 없음으로 403
    if (!actingAccount || (actingAccount.role !== "ADMIN" && actingAccount.role !== "QA")) {
        return next(createError("권한이 없습니다.", 403, "ECONOMY_ADMIN_ONLY"));
    }
    return next();
};

module.exports = {
    requireSelf,
    requireEconomyAdmin,
};
