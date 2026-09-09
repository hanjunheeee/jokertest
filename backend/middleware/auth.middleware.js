const { createError }  = require("../utils/appError");
const sessionLifecycle = require("../auth/sessionLifecycle");

exports.verifyToken = async (req, res, next) => {
    let decoded;

    try {
        const token = req.cookies.accessToken;

        if (!token) {
            return next(createError("로그인이 필요합니다.", 401));
        }

        decoded = sessionLifecycle.verifyAccessToken(token);
    } catch (error) {
        res.clearCookie("accessToken");
        return next(createError("유효하지 않거나 만료된 토큰입니다.", 401));
    }

    // 보호 요청마다 현재 세션과 활성 밴을 함께 읽는다. 캐시를 두지 않아 로그아웃·타기기
    // 로그인·운영 밴이 다음 요청부터 즉시 반영된다. Socket.IO의 authenticateSocket도 같은
    // sessionLifecycle.resolveSession을 호출하므로 두 경로의 판정이 항상 같다(F-03 AC-05).
    let result;
    try {
        result = await sessionLifecycle.resolveSession(decoded);
    } catch (error) {
        // DB 장애를 401로 바꾸면 접속자 전원이 로그아웃되고 원인도 가려집니다. 5xx로 보냅니다.
        return next(error);
    }

    if (!result.ok) {
        res.clearCookie("accessToken");
        return next(createError(result.message, result.status));
    }

    req.user = decoded;
    next();
};
