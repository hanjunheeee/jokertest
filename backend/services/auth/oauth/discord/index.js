const { createError } = require("../../../../utils/appError");

const DISCORD_AUTH_ENDPOINT     = "https://discord.com/api/oauth2/authorize";
const DISCORD_TOKEN_ENDPOINT    = "https://discord.com/api/oauth2/token";
const DISCORD_USERINFO_ENDPOINT = "https://discord.com/api/users/@me";
exports.DISCORD_TOKEN_ENDPOINT = DISCORD_TOKEN_ENDPOINT;
exports.DISCORD_USERINFO_ENDPOINT = DISCORD_USERINFO_ENDPOINT;

const DISCORD_REQUEST_TIMEOUT_MS = () => Number(process.env.DISCORD_OAUTH_TIMEOUT_MS) || 8000;

const isTimeoutError = (error) => error?.name === "TimeoutError" || error?.name === "AbortError";

const readRequiredEnv = (name) => {
    const value = process.env[name];
    if (!value) {
        throw createError(`${name} 환경변수가 설정되지 않았습니다.`, 500, "DISCORD_OAUTH_NOT_CONFIGURED");
    }
    return value;
};

const resolveRedirectUri = (purpose) =>
    purpose === "link" ? readRequiredEnv("DISCORD_LINK_REDIRECT_URI") : readRequiredEnv("DISCORD_REDIRECT_URI");

exports.buildAuthorizationUrl = (state, { purpose = "login" } = {}) => {
    const clientId    = readRequiredEnv("DISCORD_CLIENT_ID");
    const redirectUri = resolveRedirectUri(purpose);

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

exports.exchangeCodeForProfile = async (code, { purpose = "login" } = {}) => {
    if (typeof code !== "string" || !code) {
        throw createError("인가 코드가 없습니다.", 400, "DISCORD_CODE_MISSING");
    }

    const clientId     = readRequiredEnv("DISCORD_CLIENT_ID");
    const clientSecret = readRequiredEnv("DISCORD_CLIENT_SECRET");
    const redirectUri  = resolveRedirectUri(purpose);

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
            signal: AbortSignal.timeout(DISCORD_REQUEST_TIMEOUT_MS()),
        });
    } catch (error) {
        if (isTimeoutError(error)) {
            throw createError("Discord 인가 코드 교환 응답이 지연되었습니다.", 504, "DISCORD_OAUTH_TIMEOUT");
        }
        throw error;
    }
    if (!tokenResponse.ok) {
        throw createError("Discord 인가 코드 교환에 실패했습니다.", 502, "DISCORD_TOKEN_EXCHANGE_FAILED");
    }
    const tokenBody = await tokenResponse.json();
    if (typeof tokenBody.access_token !== "string" || !tokenBody.access_token) {
        throw createError("Discord로부터 access_token을 받지 못했습니다.", 502, "DISCORD_TOKEN_EXCHANGE_FAILED");
    }

    let profileResponse;
    try {
        profileResponse = await fetch(DISCORD_USERINFO_ENDPOINT, {
            headers: { authorization: `Bearer ${tokenBody.access_token}` },
            signal: AbortSignal.timeout(DISCORD_REQUEST_TIMEOUT_MS()),
        });
    } catch (error) {
        if (isTimeoutError(error)) {
            throw createError("Discord 프로필 조회 응답이 지연되었습니다.", 504, "DISCORD_OAUTH_TIMEOUT");
        }
        throw error;
    }
    if (!profileResponse.ok) {
        throw createError("Discord 프로필 조회에 실패했습니다.", 502, "DISCORD_PROFILE_FETCH_FAILED");
    }
    const profile = await profileResponse.json();
    if (typeof profile.id !== "string" || !profile.id) {
        throw createError("Discord 프로필에 고유 식별자가 없습니다.", 502, "DISCORD_PROFILE_INVALID");
    }

    return {
        subject: profile.id,
        email: typeof profile.email === "string" && profile.verified === true ? profile.email : null,
    };
};
