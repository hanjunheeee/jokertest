'use strict';

// 가입 이메일 인증 설정 파일, 번호·시간·한도·HMAC 비밀 키를 환경 변수에서 읽음
// routes/auth.routes.js(발송 한도·번호 길이)·가입 인증 서비스 config.js가 부름

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// 비밀 키가 이보다 짧으면 없는 걸로 봄
const MIN_HMAC_SECRET_LENGTH = 16;

// 비었으면 기본값, 정수가 아니거나 범위 밖이면 던짐 (잘못 쓴 설정으로 조용히 돌지 않게)
const toPositiveInt = (value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`가입 이메일 인증 설정값이 올바르지 않습니다: ${value}`);
    }
    return parsed;
};

// 설정 한 묶음 만들기 (env를 넘겨 시험이 값을 바꿀 수 있음)
const getSignupEmailConfig = (env = process.env) => {
    // 번호 6자리·10분, 다시 보내기 1분 뒤, 틀리기 5번까지, 가입 증명 10분
    const codeLength = toPositiveInt(env.SIGNUP_EMAIL_CODE_LENGTH, 6, { min: 4, max: 10 });
    const codeTtlMs = toPositiveInt(env.SIGNUP_EMAIL_CODE_TTL_MS, 600000);
    const resendCooldownMs = toPositiveInt(env.SIGNUP_EMAIL_RESEND_COOLDOWN_MS, 60000);
    const maxAttempts = toPositiveInt(env.SIGNUP_EMAIL_MAX_ATTEMPTS, 5, { min: 1, max: 20 });
    const proofTtlMs = toPositiveInt(env.SIGNUP_EMAIL_PROOF_TTL_MS, 600000);

    // 발송 한도: 같은 이메일 1시간 5번·하루 10번, 같은 IP 1시간 30번·하루 100번
    const emailHourMax = toPositiveInt(env.SIGNUP_EMAIL_HOUR_MAX, 5);
    const emailDayMax = toPositiveInt(env.SIGNUP_EMAIL_DAY_MAX, 10);
    const ipHourMax = toPositiveInt(env.SIGNUP_IP_HOUR_MAX, 30);
    const ipDayMax = toPositiveInt(env.SIGNUP_IP_DAY_MAX, 100);

    // 비밀 키가 짧으면 null (서비스가 이걸 보고 인증을 막음)
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

module.exports = { getSignupEmailConfig, HOUR_MS, DAY_MS, MIN_HMAC_SECRET_LENGTH };
