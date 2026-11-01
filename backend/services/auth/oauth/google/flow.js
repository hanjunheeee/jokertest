// Google OAuth 흐름 파일, 인가 주소 만들기 · 인가 코드 → 토큰 → 프로필
// 오류 코드·문구는 그대로 (컨트롤러가 code로 화면 돌려보냄)
const { createError } = require("../../../../utils/appError");
const { readRequiredEnv, GOOGLE_REQUEST_TIMEOUT_MS, isTimeoutError } = require('./env');
const { GOOGLE_AUTH_ENDPOINT, GOOGLE_TOKEN_ENDPOINT, GOOGLE_USERINFO_ENDPOINT } = require('./constants');

// state를 붙여 인가 주소 만듦
exports.buildAuthorizationUrl = (state) => {
    const clientId    = readRequiredEnv("GOOGLE_CLIENT_ID");
    const redirectUri = readRequiredEnv("GOOGLE_REDIRECT_URI");

    const params = new URLSearchParams({
        client_id:     clientId,
        redirect_uri:  redirectUri,
        response_type: "code",
        scope:         "openid email profile",
        state,
        prompt: "select_account",
    });

    return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
};

// 코드 없음 400, 시간 초과 504, 제공자 응답 실패 502, 확인된 이메일만 돌려줌
exports.exchangeCodeForProfile = async (code) => {
    if (typeof code !== "string" || !code) {
        throw createError("인가 코드가 없습니다.", 400, "GOOGLE_CODE_MISSING");
    }

    const clientId     = readRequiredEnv("GOOGLE_CLIENT_ID");
    const clientSecret = readRequiredEnv("GOOGLE_CLIENT_SECRET");
    const redirectUri   = readRequiredEnv("GOOGLE_REDIRECT_URI");

    let tokenResponse;
    try {
        tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
            method:  "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body:    new URLSearchParams({
                code,
                client_id:     clientId,
                client_secret: clientSecret,
                redirect_uri:  redirectUri,
                grant_type:    "authorization_code",
            }),
            signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS()),
        });
    } catch (error) {
        if (isTimeoutError(error)) {
            throw createError("Google 인가 코드 교환 응답이 지연되었습니다.", 504, "GOOGLE_OAUTH_TIMEOUT");
        }
        throw error;
    }
    if (!tokenResponse.ok) {
        throw createError("Google 인가 코드 교환에 실패했습니다.", 502, "GOOGLE_TOKEN_EXCHANGE_FAILED");
    }
    const tokenBody = await tokenResponse.json();
    if (typeof tokenBody.access_token !== "string" || !tokenBody.access_token) {
        throw createError("Google로부터 access_token을 받지 못했습니다.", 502, "GOOGLE_TOKEN_EXCHANGE_FAILED");
    }

    let profileResponse;
    try {
        profileResponse = await fetch(GOOGLE_USERINFO_ENDPOINT, {
            headers: { authorization: `Bearer ${tokenBody.access_token}` },
            signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS()),
        });
    } catch (error) {
        if (isTimeoutError(error)) {
            throw createError("Google 프로필 조회 응답이 지연되었습니다.", 504, "GOOGLE_OAUTH_TIMEOUT");
        }
        throw error;
    }
    if (!profileResponse.ok) {
        throw createError("Google 프로필 조회에 실패했습니다.", 502, "GOOGLE_PROFILE_FETCH_FAILED");
    }
    const profile = await profileResponse.json();
    if (typeof profile.sub !== "string" || !profile.sub) {
        throw createError("Google 프로필에 고유 식별자가 없습니다.", 502, "GOOGLE_PROFILE_INVALID");
    }

    return {
        subject: profile.sub,
        email: typeof profile.email === "string" && profile.email_verified === true ? profile.email : null,
    };
};
