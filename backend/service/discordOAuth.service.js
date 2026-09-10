const { createError } = require("../utils/appError");

// F-07: Discord 제공자 검증 어댑터. googleOAuth.service.js(F-06)와 같은 계약이다 —
// socialAuth.service.js(F-05)는 provider/subject/email이 이미 검증된 값이라는 전제로만
// 동작하므로, 이 파일이 그 검증을 실제로 수행해 handleOAuthCallback에 넘길 subject·email을
// 만든다.

const DISCORD_AUTH_ENDPOINT     = "https://discord.com/api/oauth2/authorize";
const DISCORD_TOKEN_ENDPOINT    = "https://discord.com/api/oauth2/token";
const DISCORD_USERINFO_ENDPOINT = "https://discord.com/api/users/@me";
// 테스트가 실제 fetch를 유지한 채 요청 목적지만 로컬 fixture 서버로 돌릴 수 있게 노출한다
// (discordOAuth.service.test.js) — googleOAuth.service.test.js와 같은 이유.
exports.DISCORD_TOKEN_ENDPOINT = DISCORD_TOKEN_ENDPOINT;
exports.DISCORD_USERINFO_ENDPOINT = DISCORD_USERINFO_ENDPOINT;

// F-06 R-IMPL #3과 같은 이유로 Discord도 유한한 시간 안에 포기해야 한다(운영 기본값 8초).
const DISCORD_REQUEST_TIMEOUT_MS = () => Number(process.env.DISCORD_OAUTH_TIMEOUT_MS) || 8000;

const isTimeoutError = (error) => error?.name === "TimeoutError" || error?.name === "AbortError";

// AC-05: 클라이언트 비밀키(및 클라이언트 ID·redirect_uri)는 코드에 하드코딩하지 않고
// 환경변수로만 읽는다. 고객센터 Discord 초대 URL과는 완전히 분리된 별도 설정 값이다 — 이
// 이름들은 OAuth 앱 자격만 가리키고, 초대 URL은 이 서비스가 전혀 참조하지 않는다. require
// 시점이 아니라 호출 시점에 읽어야, 아직 실제 Discord 앱 키가 없는 환경(AC-06)에서도 이
// 모듈을 불러오는 것 자체는 실패하지 않는다.
const readRequiredEnv = (name) => {
    const value = process.env[name];
    if (!value) {
        throw createError(`${name} 환경변수가 설정되지 않았습니다.`, 500, "DISCORD_OAUTH_NOT_CONFIGURED");
    }
    return value;
};

// 로그인 시작 — 사용자를 Discord 동의 화면으로 보낼 URL을 만든다. state는 이미
// socialAuthService.issueOAuthState(F-05)가 발급한 원문을 그대로 받아 그대로 실어 보낸다.
exports.buildAuthorizationUrl = (state) => {
    const clientId    = readRequiredEnv("DISCORD_CLIENT_ID");
    const redirectUri = readRequiredEnv("DISCORD_REDIRECT_URI");

    const params = new URLSearchParams({
        client_id:     clientId,
        redirect_uri:  redirectUri,
        response_type: "code",
        scope:         "identify email",
        state,
        // 브라우저에 남아있는 이전 Discord 세션으로 조용히 재로그인되어 사용자가 의도하지
        // 않은 계정으로 연결되는 것을 막기 위해, 매번 계정 선택 화면을 보여준다(Google의
        // prompt=select_account와 같은 의도).
        prompt: "consent",
    });

    return `${DISCORD_AUTH_ENDPOINT}?${params.toString()}`;
};

// 콜백 — 인가 코드를 Discord와 교환해 실제로 검증된 subject(id)·email을 얻는다. 이 함수가
// 반환하는 값만 socialAuthService.resolveOAuthAccount에 전달되므로, subject·email은 반드시
// 이 함수 안에서 Discord 서버가 확인해 준 값이어야 한다 — 클라이언트가 주장한 값을 그대로
// 통과시키면 F-05 A-03(제공자 식별자로만 조회)이 무너진다.
exports.exchangeCodeForProfile = async (code) => {
    if (typeof code !== "string" || !code) {
        throw createError("인가 코드가 없습니다.", 400, "DISCORD_CODE_MISSING");
    }

    const clientId     = readRequiredEnv("DISCORD_CLIENT_ID");
    const clientSecret = readRequiredEnv("DISCORD_CLIENT_SECRET");
    const redirectUri   = readRequiredEnv("DISCORD_REDIRECT_URI");

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
        // Discord가 이메일 소유를 검증하지 못한 경우(verified:false)는 이메일 없이 넘긴다 —
        // resolveOAuthAccount는 email 없이 재로그인은 허용하지만(기존 identity로 조회),
        // 신규 가입은 email 없이는 거부한다(F-05 AC-02 EMAIL_MISSING). 검증되지 않은
        // 이메일로 EMAIL_CONFLICT 병합 판정을 내리면 계정 탈취 경로가 열릴 수 있다.
        email: typeof profile.email === "string" && profile.verified === true ? profile.email : null,
    };
};
