// Discord OAuth 흐름 파일, 인가 주소 만들기 · 인가 코드 → 토큰 → 프로필
// oauth/discord 입구로 controllers/auth/discord.js·discordLink.js, social/discordLogin.js·discordLink.js가 부름
// 오류 코드·문구는 그대로 (컨트롤러가 code로 화면 돌려보냄)
const { createError } = require("../../../../utils/appError");
const { readRequiredEnv, resolveRedirectUri, REQUEST_TIMEOUT_MS, isTimeoutError } = require('./env');
const { DISCORD_AUTH_ENDPOINT, DISCORD_TOKEN_ENDPOINT, DISCORD_USERINFO_ENDPOINT } = require('./constants');

// state를 붙여 인가 주소 만듦 (돌아올 주소는 로그인·연결 목적마다 다름)
exports.buildAuthorizationUrl = (state, { purpose = "login" } = {}) => {
    const clientId    = readRequiredEnv("DISCORD_CLIENT_ID");
    const redirectUri = resolveRedirectUri(purpose);

    // 이메일까지 받고, 매번 동의 화면 띄움
    const params = new URLSearchParams({
        client_id:     clientId,
        redirect_uri:  redirectUri,
        response_type: "code",
        scope:         "identify email",
        state,
        prompt: "consent",
    });

    return `${DISCORD_AUTH_ENDPOINT}?${params.toString()}`;
};

// 코드 없음 400, 시간 초과 504, 제공자 응답 실패 502, 확인된 이메일만 돌려줌
exports.exchangeCodeForProfile = async (code, { purpose = "login" } = {}) => {
    // 코드 없으면 제공자 안 부름
    if (typeof code !== "string" || !code) {
        throw createError("인가 코드가 없습니다.", 400, "DISCORD_CODE_MISSING");
    }

    // 돌아올 주소는 인가 때와 같아야 제공자가 받아 줌
    const clientId     = readRequiredEnv("DISCORD_CLIENT_ID");
    const clientSecret = readRequiredEnv("DISCORD_CLIENT_SECRET");
    const redirectUri  = resolveRedirectUri(purpose);

    // 인가 코드 → access 토큰, 오래 걸리면 끊고 504
    let tokenResponse;
    try {
        tokenResponse = await fetch(DISCORD_TOKEN_ENDPOINT, {
            method:  "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body:    new URLSearchParams({
                code,
                client_id:     clientId,
                client_secret: clientSecret,
                redirect_uri:  redirectUri,
                grant_type:    "authorization_code",
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS()),
        });
    } catch (error) {
        if (isTimeoutError(error)) {
            throw createError("Discord 인가 코드 교환 응답이 지연되었습니다.", 504, "DISCORD_OAUTH_TIMEOUT");
        }
        throw error;
    }
    // 실패 응답이거나 토큰 빠졌으면 502
    if (!tokenResponse.ok) {
        throw createError("Discord 인가 코드 교환에 실패했습니다.", 502, "DISCORD_TOKEN_EXCHANGE_FAILED");
    }
    const tokenBody = await tokenResponse.json();
    if (typeof tokenBody.access_token !== "string" || !tokenBody.access_token) {
        throw createError("Discord로부터 access_token을 받지 못했습니다.", 502, "DISCORD_TOKEN_EXCHANGE_FAILED");
    }

    // access 토큰 → 프로필, 오래 걸리면 끊고 504
    let profileResponse;
    try {
        profileResponse = await fetch(DISCORD_USERINFO_ENDPOINT, {
            headers: { authorization: `Bearer ${tokenBody.access_token}` },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS()),
        });
    } catch (error) {
        if (isTimeoutError(error)) {
            throw createError("Discord 프로필 조회 응답이 지연되었습니다.", 504, "DISCORD_OAUTH_TIMEOUT");
        }
        throw error;
    }
    // 실패 응답이거나 고유 id 없으면 502 (id로 계정 찾기 때문)
    if (!profileResponse.ok) {
        throw createError("Discord 프로필 조회에 실패했습니다.", 502, "DISCORD_PROFILE_FETCH_FAILED");
    }
    const profile = await profileResponse.json();
    if (typeof profile.id !== "string" || !profile.id) {
        throw createError("Discord 프로필에 고유 식별자가 없습니다.", 502, "DISCORD_PROFILE_INVALID");
    }

    // 확인 안 된 이메일은 null (남의 이메일로 가입되는 것 막기, 그때는 이메일 인증 받음)
    return {
        subject: profile.id,
        email: typeof profile.email === "string" && profile.verified === true ? profile.email : null,
    };
};
