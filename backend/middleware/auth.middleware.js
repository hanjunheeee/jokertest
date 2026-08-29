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

    // 서명이 유효하다는 건 "우리가 발급한 토큰"이라는 뜻일 뿐, "지금도 유효한 로그인"이라는
    // 뜻은 아닙니다. 로그아웃이나 타기기 로그인으로 user_sessions.is_online이 false가 된
    // 세션의 토큰은 만료(1d) 전이라도 살아 있으므로, 세션 상태를 여기서 한 번 확인합니다.
    let session;
    try {
        session = await userRepository.findSessionById(decoded.sessionId);
    } catch (error) {
        // DB 장애를 401로 바꾸면 접속자 전원이 로그아웃되고 원인도 가려집니다. 5xx로 보냅니다.
        return next(error);
    }

    if (!session || !session.is_online) {
        res.clearCookie("accessToken");
        return next(createError("세션이 만료되었습니다. 다시 로그인해주세요.", 401));
    }

    req.user = decoded;
    next();
};
