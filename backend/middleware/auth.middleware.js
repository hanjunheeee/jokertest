/**
 * @file auth.middleware.js
 * @desc HttpOnly 쿠키의 JWT를 검증하는 인증 미들웨어
 */

const jwt = require("jsonwebtoken");
const { createError } = require("../utils/appError");

/**
 * 쿠키에서 accessToken을 꺼내 JWT를 검증합니다.
 * 성공 시 디코딩된 유저 정보를 `req.user`에 저장하고 다음 미들웨어로 넘깁니다.
 * @param {import('express').Request}      req
 * @param {import('express').Response}     res
 * @param {import('express').NextFunction} next
 */
exports.verifyToken = (req, res, next) => {
    try {
        const token = req.cookies.accessToken;

        if (!token) {
            return next(createError("로그인이 필요합니다.", 401));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        // 만료·위조된 토큰 — 클라이언트 쿠키도 즉시 제거
        res.clearCookie("accessToken");
        next(createError("유효하지 않거나 만료된 토큰입니다.", 401));
    }
};
