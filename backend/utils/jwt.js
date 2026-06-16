/**
 * @file jwt.js
 * @desc JWT 생성 유틸리티
 */

const jwt = require("jsonwebtoken");

/**
 * 유저 정보를 담은 JWT를 생성합니다. 유효기간 24시간.
 * @param {Object} payload - 토큰에 담을 데이터 (uuid, role, sessionId 등)
 * @returns {string} 서명된 JWT 문자열
 */
exports.generateToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_SECRET || "default_secret_key", {
        expiresIn: "1d",
    });
};
