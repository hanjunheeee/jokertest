const jwt = require("jsonwebtoken");
const { createError }  = require("../utils/appError");
const userRepository   = require("../repositories/user.repositories");

exports.verifyToken = async (req, res, next) => {
    let decoded;

    try {
        const token = req.cookies.accessToken;

        if (!token) {
            return next(createError("로그인이 필요합니다.", 401));
        }

        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        res.clearCookie("accessToken");
        return next(createError("유효하지 않거나 만료된 토큰입니다.", 401));
    }

    if (!decoded?.uuid || !decoded?.sessionId) {
        res.clearCookie("accessToken");
        return next(createError("유효하지 않거나 만료된 토큰입니다.", 401));
    }

    // 보호 요청마다 현재 세션과 활성 밴을 함께 읽는다. 캐시를 두지 않아 로그아웃·타기기
    // 로그인·운영 밴이 다음 요청부터 즉시 반영된다. 두 독립 조회는 병렬로 실행한다.
    let session;
    let activeBan;
    try {
        [session, activeBan] = await Promise.all([
            userRepository.findActiveSession(decoded.sessionId, decoded.uuid),
            userRepository.checkActiveBan(decoded.uuid),
        ]);
    } catch (error) {
        // DB 장애를 401로 바꾸면 접속자 전원이 로그아웃되고 원인도 가려집니다. 5xx로 보냅니다.
        return next(error);
    }

    if (!session || (session.is_online !== true && session.is_online !== 1)) {
        res.clearCookie("accessToken");
        return next(createError("세션이 만료되었습니다. 다시 로그인해주세요.", 401));
    }

    if (activeBan) {
        res.clearCookie("accessToken");
        return next(createError(`정지된 계정입니다. 사유: ${activeBan.reason || "운영정책 위반"}`, 403));
    }

    req.user = decoded;
    next();
};
