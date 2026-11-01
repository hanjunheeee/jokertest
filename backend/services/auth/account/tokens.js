// refresh 토큰 파일, 비밀 값 만들기 · 해시 · 회전 값 만들기
// account/session.js·account/refresh.js가 부름
// DB엔 해시만 저장, 회전 값은 JWT_SECRET HMAC으로 (부를 때 읽음)
const crypto                  = require("crypto");

// 새 refresh 비밀 값 (추측 못 하는 무작위 32바이트)
const generateRefreshSecret = () => crypto.randomBytes(32).toString("base64url");

// DB에 넣을 refresh 해시 (DB가 새도 원래 토큰은 안 드러나게)
const hashRefreshToken      = (rawToken) => crypto.createHash("sha256").update(rawToken).digest("hex");

// 같은 세션·이전 토큰이면 같은 새 토큰 (응답 놓쳐 다시 와도 같게)
const deriveRotatedToken = (previousRawToken, sessionId) =>
    crypto.createHmac("sha256", process.env.JWT_SECRET)
        .update(`refresh-rotation-v1:${sessionId}:${previousRawToken}`)
        .digest("base64url");

module.exports = {
    generateRefreshSecret,
    hashRefreshToken,
    deriveRotatedToken,
};
