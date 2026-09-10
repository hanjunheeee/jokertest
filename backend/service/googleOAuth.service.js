const { createError } = require("../utils/appError");

// F-06: Google 제공자 검증 어댑터. socialAuth.service.js(F-05)는 provider/subject/email이
// 이미 검증된 값이라는 전제로만 동작한다(auth.routes.js의 F-06/F-07 계약 주석 참고) — 이
// 파일이 바로 그 검증을 실제로 수행해 handleOAuthCallback에 넘길 subject·email을 만든다.

const GOOGLE_AUTH_ENDPOINT      = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT     = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT  = "https://openidconnect.googleapis.com/v1/userinfo";

// AC-03: 클라이언트 비밀키(및 클라이언트 ID·redirect_uri)는 코드에 하드코딩하지 않고
// 환경변수로만 읽는다. require 시점이 아니라 호출 시점에 읽어야, 아직 실제 Google 앱 키가
// 없는 환경(AC-05)에서도 이 모듈을 불러오는 것 자체는 실패하지 않는다.
const readRequiredEnv = (name) => {
    const value = process.env[name];
    if (!value) {
        throw createError(`${name} 환경변수가 설정되지 않았습니다.`, 500, "GOOGLE_OAUTH_NOT_CONFIGURED");
    }
    return value;
};

// 로그인 시작 — 사용자를 Google 동의 화면으로 보낼 URL을 만든다. state는 이미
// socialAuthService.issueOAuthState(F-05)가 발급한 원문을 그대로 받아 그대로 실어 보낸다.
exports.buildAuthorizationUrl = (state) => {
    const clientId    = readRequiredEnv("GOOGLE_CLIENT_ID");
    const redirectUri = readRequiredEnv("GOOGLE_REDIRECT_URI");

    const params = new URLSearchParams({
        client_id:     clientId,
        redirect_uri:  redirectUri,
        response_type: "code",
        scope:         "openid email profile",
        state,
        // 브라우저에 남아있는 이전 Google 세션으로 조용히 재로그인되어 사용자가 의도하지
        // 않은 계정으로 연결되는 것을 막기 위해, 매번 계정 선택 화면을 보여준다.
        prompt: "select_account",
    });

    return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
};

// 콜백 — 인가 코드를 Google과 교환해 실제로 검증된 subject(sub)·email을 얻는다. 이 함수가
// 반환하는 값만 socialAuthService.handleOAuthCallback에 전달되므로, subject·email은 반드시
// 이 함수 안에서 Google 서버가 확인해 준 값이어야 한다 — 클라이언트가 주장한 값을 그대로
// 통과시키면 F-05 A-03(제공자 식별자로만 조회)이 무너진다.
exports.exchangeCodeForProfile = async (code) => {
    if (typeof code !== "string" || !code) {
        throw createError("인가 코드가 없습니다.", 400, "GOOGLE_CODE_MISSING");
    }

    const clientId     = readRequiredEnv("GOOGLE_CLIENT_ID");
    const clientSecret = readRequiredEnv("GOOGLE_CLIENT_SECRET");
    const redirectUri   = readRequiredEnv("GOOGLE_REDIRECT_URI");

    const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method:  "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body:    new URLSearchParams({
            code,
            client_id:     clientId,
            client_secret: clientSecret,
            redirect_uri:  redirectUri,
            grant_type:    "authorization_code",
        }),
    });
    if (!tokenResponse.ok) {
        throw createError("Google 인가 코드 교환에 실패했습니다.", 502, "GOOGLE_TOKEN_EXCHANGE_FAILED");
    }
    const tokenBody = await tokenResponse.json();
    if (typeof tokenBody.access_token !== "string" || !tokenBody.access_token) {
        throw createError("Google로부터 access_token을 받지 못했습니다.", 502, "GOOGLE_TOKEN_EXCHANGE_FAILED");
    }

    const profileResponse = await fetch(GOOGLE_USERINFO_ENDPOINT, {
        headers: { authorization: `Bearer ${tokenBody.access_token}` },
    });
    if (!profileResponse.ok) {
        throw createError("Google 프로필 조회에 실패했습니다.", 502, "GOOGLE_PROFILE_FETCH_FAILED");
    }
    const profile = await profileResponse.json();
    if (typeof profile.sub !== "string" || !profile.sub) {
        throw createError("Google 프로필에 고유 식별자가 없습니다.", 502, "GOOGLE_PROFILE_INVALID");
    }

    return {
        subject: profile.sub,
        // Google이 이메일 소유를 검증하지 못한 경우(email_verified:false)는 이메일 없이
        // 넘긴다 — handleOAuthCallback은 email 없이 재로그인은 허용하지만(기존 identity로
        // 조회), 신규 가입은 email 없이는 거부한다(F-05 AC-02 EMAIL_MISSING). 검증되지 않은
        // 이메일로 EMAIL_CONFLICT 병합 판정을 내리면 계정 탈취 경로가 열릴 수 있다.
        email: typeof profile.email === "string" && profile.email_verified === true ? profile.email : null,
    };
};
