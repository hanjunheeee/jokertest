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
        if (error?.name === "TokenExpiredError") {
            return next(createError("액세스 토큰이 만료되었습니다.", 401, "ACCESS_TOKEN_EXPIRED"));
        }
        res.clearCookie("accessToken");
        return next(createError("유효하지 않거나 만료된 토큰입니다.", 401));
    }

    let result;
    try {
        result = await sessionLifecycle.resolveSession(decoded);
    } catch (error) {
        return next(error);
    }

    if (!result.ok) {
        res.clearCookie("accessToken");
        return next(createError(result.message, result.status));
    }

    req.user = decoded;
    next();
};
