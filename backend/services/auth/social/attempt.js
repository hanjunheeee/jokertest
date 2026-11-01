// OAuth 시도 표 파일, 시도 표(JWT) 서명·확인 + 소셜 가입 rememberMe 판정
// 서명은 같은 폴더 googleLogin·discordLogin·discordLink.js, 확인은 social 입구로 controllers/auth/google·discord·discordLink·socialSignup.js
// 시도 쿠키에 넣고 꺼낼 때 씀 (JWT_SECRET은 부를 때 읽음)
const jwt = require("jsonwebtoken");

// 시도 표를 JWT_SECRET으로 서명 (쿠키 고쳐 쓰기 막기)
const signOAuthAttempt = (payload, ttlSeconds) =>
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ttlSeconds });

// 서명 틀리거나 만료면 null (던지지 않음, 없는 시도 표처럼 다룸)
const verifyOAuthAttempt = (token) => {
    if (typeof token !== "string" || !token) return null;
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return null;
    }
};

// 같은 가입 의도의 소셜 가입 시도 표이고 로그인 유지였을 때만 참 (다른 시도 표는 안 믿음)
const rememberMeForSignup = (attempt, intentToken) => attempt?.purpose === "signup"
    && attempt?.intentToken === intentToken
    && attempt?.rememberMe === true;

module.exports = {
    signOAuthAttempt,
    verifyOAuthAttempt,
    rememberMeForSignup,
};
