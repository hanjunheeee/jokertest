'use strict';

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
