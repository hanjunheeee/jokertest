'use strict';

// F-31a: 가입 이메일 인증(인증번호·가입 증명)의 서버 설정. 기존 rateLimit.js의
// createRateLimiter처럼 호출자가 시간·한도 값을 공급받아 쓰므로, 이 파일은 그 값들을
// 환경변수에서 읽고 검증하는 한 곳으로 모은다. auth.routes.js(라우터 구성 시 한 번)와
// signupEmailVerification.service.js(발급·확인·소비 호출마다)가 이 함수를 부른다.
//
// 숫자값은 잘못 설정되면 즉시 예외를 던진다(createRateLimiter와 같은 fail-fast 원칙) —
// 조용히 기본값으로 떨어지면 운영자가 의도한 한도가 적용되지 않은 채로 서비스가 열릴 수
// 있다. 반면 전용 HMAC 비밀값(SIGNUP_EMAIL_HMAC_SECRET)은 여기서 던지지 않는다 — 이 값은
// auth.routes.js가 라우터를 구성하는 시점(단지 숫자 설정만 필요)에는 필요 없고, 실제로
// 인증번호를 발급·소비하는 시점에만 필요하다. 여기서 던지면 이 모듈을 단지 require하기만
// 하는 무관한 기존 시험(auth.routes.js를 마운트하는 모든 기존 스위트)까지 비밀값 없이는
// 전부 깨진다 — 그래서 비밀값 검증은 호출자(서비스 함수)가 실제로 해시를 계산하기 직전에
// config.hmacSecret가 없으면 그때 실패시키도록 미룬다.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const MIN_HMAC_SECRET_LENGTH = 16;

const toPositiveInt = (value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`가입 이메일 인증 설정값이 올바르지 않습니다: ${value}`);
    }
    return parsed;
};

/**
 * 서버 환경설정(env, 보통 process.env)에서 가입 이메일 인증에 필요한 설정을 읽어
 * 검증한 뒤 반환한다. 비밀값(hmacSecret)은 형식이 올바를 때만 문자열로 채워지고,
 * 없거나 너무 짧으면 null이다 — 반환값 자체에는 원문이 그대로 담기지만 이 함수는 그
 * 값을 로그로 출력하지 않는다(호출부도 출력해서는 안 된다).
 */
const getSignupEmailVerificationConfig = (env = process.env) => {
    const codeLength = toPositiveInt(env.SIGNUP_EMAIL_CODE_LENGTH, 6, { min: 4, max: 10 });
    const codeTtlMs = toPositiveInt(env.SIGNUP_EMAIL_CODE_TTL_MS, 600000);
    const resendCooldownMs = toPositiveInt(env.SIGNUP_EMAIL_RESEND_COOLDOWN_MS, 60000);
    const maxAttempts = toPositiveInt(env.SIGNUP_EMAIL_MAX_ATTEMPTS, 5, { min: 1, max: 20 });
    const proofTtlMs = toPositiveInt(env.SIGNUP_EMAIL_PROOF_TTL_MS, 600000);

    const emailHourMax = toPositiveInt(env.SIGNUP_EMAIL_HOUR_MAX, 5);
    const emailDayMax = toPositiveInt(env.SIGNUP_EMAIL_DAY_MAX, 10);
    const ipHourMax = toPositiveInt(env.SIGNUP_IP_HOUR_MAX, 30);
    const ipDayMax = toPositiveInt(env.SIGNUP_IP_DAY_MAX, 100);

    const rawSecret = env.SIGNUP_EMAIL_HMAC_SECRET;
    const hmacSecret = (typeof rawSecret === 'string' && rawSecret.length >= MIN_HMAC_SECRET_LENGTH)
        ? rawSecret
        : null;

    return {
        codeLength,
        codeTtlMs,
        resendCooldownMs,
        maxAttempts,
        proofTtlMs,
        emailHourWindowMs: HOUR_MS,
        emailHourMax,
        emailDayWindowMs: DAY_MS,
        emailDayMax,
        ipHourWindowMs: HOUR_MS,
        ipHourMax,
        ipDayWindowMs: DAY_MS,
        ipDayMax,
        hmacSecret,
    };
};

module.exports = { getSignupEmailVerificationConfig, HOUR_MS, DAY_MS, MIN_HMAC_SECRET_LENGTH };
