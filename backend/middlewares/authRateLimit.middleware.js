// 인증 요청 수 제한 만드는 파일, 로그인·가입 인증번호·아이디 찾기·비번 재설정 제한 정의
// routes/auth.routes.js가 불러올 때 한 번 만듦 (시험은 라우트를 다시 불러 새 카운터 받음)
const crypto = require("crypto");

// 양의 정수 아니면 기본값 (가입 인증 config와 달리 안 던짐)
const toPositiveInt = (value, fallback) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// 가입 인증번호 제한 4개 (ip 시간·하루, 주소 시간·하루), 주소 키는 해시로 (원문 안 남기기)
// 주소 키는 검사가 채운 res.locals를 읽음 → 라우트에서 검사 뒤에 두기
// createRateLimiter는 라우트가 넘김 (미들웨어끼리 안 부르기)
const buildSignupCodeRateLimiters = (codeConfig, createRateLimiter) => {
    const codeIpHourLimiter = createRateLimiter({
        windowMs: codeConfig.ipHourWindowMs,
        max:      codeConfig.ipHourMax,
        keyOf:    (req) => `ip-hour:${req.ip}`,
    });
    const codeIpDayLimiter = createRateLimiter({
        windowMs: codeConfig.ipDayWindowMs,
        max:      codeConfig.ipDayMax,
        keyOf:    (req) => `ip-day:${req.ip}`,
    });
    const codeEmailHourLimiter = createRateLimiter({
        windowMs: codeConfig.emailHourWindowMs,
        max:      codeConfig.emailHourMax,
        keyOf:    (req, res) => `email-hour:${crypto.createHash("sha256").update(res.locals.signupEmailCodeInput.email).digest("hex")}`,
    });
    const codeEmailDayLimiter = createRateLimiter({
        windowMs: codeConfig.emailDayWindowMs,
        max:      codeConfig.emailDayMax,
        keyOf:    (req, res) => `email-day:${crypto.createHash("sha256").update(res.locals.signupEmailCodeInput.email).digest("hex")}`,
    });
    return {
        ipHour:    codeIpHourLimiter,
        ipDay:     codeIpDayLimiter,
        emailHour: codeEmailHourLimiter,
        emailDay:  codeEmailDayLimiter,
    };
};

// 아이디 찾기 제한 2개 (ip, 찾는 닉네임), env는 부르는 때 읽음, 닉네임 키도 해시로
const buildFindIdRateLimiters = (env, createRateLimiter) => {
    const findIdIpLimiter = createRateLimiter({
        windowMs: toPositiveInt(env.FIND_ID_WINDOW_MS, 600000),
        max:      toPositiveInt(env.FIND_ID_IP_MAX, 10),
        keyOf:    (req) => `ip:${req.ip}`,
    });

    const findIdTargetLimiter = createRateLimiter({
        windowMs: toPositiveInt(env.FIND_ID_WINDOW_MS, 600000),
        max:      toPositiveInt(env.FIND_ID_TARGET_MAX, 5),
        keyOf:    (req, res) => `target:${crypto.createHash("sha256").update(res.locals.findIdInput.nickname).digest("hex")}`,
    });
    return { ip: findIdIpLimiter, target: findIdTargetLimiter };
};

// 비번 재설정 제한 3개 (요청 ip, 요청 주소, 확인 ip)
// 확인 ip는 인스턴스 하나를 verify·confirm 둘이 같이 씀 (둘로 나누면 한도 두 배)
const buildPasswordResetRateLimiters = (env, createRateLimiter) => {
    const resetRequestIpLimiter = createRateLimiter({
        windowMs: toPositiveInt(env.PASSWORD_RESET_REQUEST_WINDOW_MS, 60 * 60 * 1000),
        max:      toPositiveInt(env.PASSWORD_RESET_REQUEST_IP_MAX, 10),
        keyOf:    (req) => `ip:${req.ip}`,
    });

    // 대소문자만 다른 주소도 한 키로 셈
    const resetEmailLimiter = createRateLimiter({
        windowMs: toPositiveInt(env.PASSWORD_RESET_REQUEST_WINDOW_MS, 60 * 60 * 1000),
        max:      toPositiveInt(env.PASSWORD_RESET_REQUEST_EMAIL_MAX, 3),
        keyOf:    (req, res) => `email:${crypto.createHash("sha256")
            .update(res.locals.passwordResetInput.email.trim().toLowerCase())
            .digest("hex")}`,
    });

    const resetCheckIpLimiter = createRateLimiter({
        windowMs: toPositiveInt(env.PASSWORD_RESET_CHECK_WINDOW_MS, 10 * 60 * 1000),
        max:      toPositiveInt(env.PASSWORD_RESET_CHECK_IP_MAX, 20),
        keyOf:    (req) => `ip:${req.ip}`,
    });
    return {
        requestIp:    resetRequestIpLimiter,
        requestEmail: resetEmailLimiter,
        checkIp:      resetCheckIpLimiter,
    };
};

// 너무 많으면 화면에 띄울 문구
const TOO_MANY_MESSAGE = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";

// 로그인·이메일 중복 확인·refresh·소셜 가입 ip 제한
// 로그인 ip 제한은 흔한 비번 뿌리기·남의 계정 잠그기 반복 막기, refresh는 PC방처럼 ip 하나에 여럿이라 넉넉히
const buildAccountRateLimiters = (env, createRateLimiter) => {
    const tenMinutes = 10 * 60 * 1000;
    const login = createRateLimiter({
        windowMs: toPositiveInt(env.LOGIN_IP_WINDOW_MS, tenMinutes),
        max:      toPositiveInt(env.LOGIN_IP_MAX, 50),
        keyOf:    (req) => `login-ip:${req.ip}`,
        message:  "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
    });
    const checkEmail = createRateLimiter({
        windowMs: toPositiveInt(env.CHECK_EMAIL_IP_WINDOW_MS, tenMinutes),
        max:      toPositiveInt(env.CHECK_EMAIL_IP_MAX, 60),
        keyOf:    (req) => `check-email-ip:${req.ip}`,
        message:  TOO_MANY_MESSAGE,
    });
    const refresh = createRateLimiter({
        windowMs: toPositiveInt(env.REFRESH_IP_WINDOW_MS, tenMinutes),
        max:      toPositiveInt(env.REFRESH_IP_MAX, 600),
        keyOf:    (req) => `refresh-ip:${req.ip}`,
        message:  TOO_MANY_MESSAGE,
    });
    const socialSignup = createRateLimiter({
        windowMs: toPositiveInt(env.SOCIAL_SIGNUP_IP_WINDOW_MS, tenMinutes),
        max:      toPositiveInt(env.SOCIAL_SIGNUP_IP_MAX, 60),
        keyOf:    (req) => `social-signup-ip:${req.ip}`,
        message:  TOO_MANY_MESSAGE,
    });
    return { login, checkEmail, refresh, socialSignup };
};

module.exports = {
    buildAccountRateLimiters,
    buildSignupCodeRateLimiters,
    buildFindIdRateLimiters,
    buildPasswordResetRateLimiters,
};
