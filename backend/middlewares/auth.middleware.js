// 로그인 확인 미들웨어 파일, access 쿠키 토큰 + 세션 살아 있는지 확인 뒤 req.user 채움
// routes/*.routes.js가 로그인 필요한 경로 맨 앞에 둠 (세션·정지 확인은 services/auth/sessionLifecycle.js)
const { createError }  = require("../utils/appError");
const sessionLifecycle = require("../services/auth/sessionLifecycle");

// 토큰 서명·만료 → 세션·정지 확인 → req.user (실패는 401, 정지는 403)
exports.verifyToken = async (req, res, next) => {
    let decoded;

    try {
        const token = req.cookies.accessToken;

        if (!token) {
            return next(createError("로그인이 필요합니다.", 401));
        }

        decoded = sessionLifecycle.verifyAccessToken(token);
    } catch (error) {
        // 만료는 쿠키 안 지우고 코드만 붙임 (프론트가 refresh로 새로 받음)
        if (error?.name === "TokenExpiredError") {
            return next(createError("액세스 토큰이 만료되었습니다.", 401, "ACCESS_TOKEN_EXPIRED"));
        }
        // 서명 틀림·깨진 토큰은 다시 안 보내게 쿠키 지움
        res.clearCookie("accessToken");
        return next(createError("유효하지 않거나 만료된 토큰입니다.", 401));
    }

    // 세션 끊김·로그인 유지 만료·정지 확인 (DB 오류는 그대로 넘김)
    let result;
    try {
        result = await sessionLifecycle.resolveSession(decoded);
    } catch (error) {
        return next(error);
    }

    // 세션 죽었으면 쿠키 지우고 서비스가 준 상태·문구로
    if (!result.ok) {
        res.clearCookie("accessToken");
        return next(createError(result.message, result.status));
    }

    req.user = decoded;
    next();
};
