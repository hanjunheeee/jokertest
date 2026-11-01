// 경제 경로 권한 미들웨어 파일, 본인 확인(requireSelf) · 관리자 지급 권한(requireEconomyAdmin)
// routes/economy.routes.js가 verifyToken 뒤에 줄 세움 (계정 읽기는 유저 서비스 입구로)
const { createError } = require("../utils/appError");
const userService     = require("../services/user");

// 로그인 uuid 없으면 401, 경로 userId가 있고 본인과 다르면 403 (userId 없는 경로는 통과)
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

// 관리자 지급 권한: 계정 role이 ADMIN·QA일 때만 통과 (규칙은 라우트에 있던 그대로)
// next()는 try 밖 (처리기에서 난 오류가 다시 catch로 와서 next 두 번 부르는 일 막기)
const requireEconomyAdmin = async (req, res, next) => {
    let actingAccount;
    try {
        actingAccount = await userService.findByUuid(req.user.uuid);
    } catch (error) {
        // 빈 값으로 던져도 지급 처리기로 안 넘어가기 (옛 자리와 같이 이 경로 건너뜀)
        return next(error || "route");
    }
    if (!actingAccount || (actingAccount.role !== "ADMIN" && actingAccount.role !== "QA")) {
        return next(createError("권한이 없습니다.", 403, "ECONOMY_ADMIN_ONLY"));
    }
    return next();
};

module.exports = {
    requireSelf,
    requireEconomyAdmin,
};
