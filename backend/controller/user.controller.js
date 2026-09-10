const crypto            = require("crypto");
const jwt                = require("jsonwebtoken");
const authService       = require("../service/auth.service");
const socialAuthService = require("../service/socialAuth.service");
const googleOAuthService = require("../service/googleOAuth.service");
const discordOAuthService = require("../service/discordOAuth.service");
const userRepository    = require("../repositories/user.repositories");
const { getDeviceType } = require("../utils/device");
const { getClientIp }   = require("../utils/ip");
const { buildSessionCookieOptions, buildRefreshCookieOptions, clearSessionCookie, clearRefreshCookie } = require("../auth/cookieOptions");

// F-06: Google OAuth 왕복(시작 → Google 동의 → 콜백, 그리고 신규 계정이면 그 뒤의 가입
// 보완까지) 동안만 살아있는 값을 쿠키에 담아 보존한다 — browserFingerprint(state에 결합되는
// 값, F-05 A-04)와 rememberMe(로그인 상태 유지 선택, AC-02/A-02).
//
// 이전 회차는 이 둘을 각각 평문 httpOnly 쿠키(oauthFp/oauthRememberMe)로 나눠 보존했다.
// 재검토 지적(R-IMPL #2): HttpOnly는 브라우저 스크립트의 "읽기"만 막을 뿐, 그 값 자체가
// 서버가 발급했다는 것을 증명하지 않는다 — 평문 쿠키는 값을 위조해도 서버가 구분할 방법이
// 없었다. 이제 두 값을 하나의 서버 서명(JWT, HMAC)된 토큰에 담아 내려보낸다: 서명이 없으면
// 애초에 값 자체가 존재하지 않는 것과 같게 취급되므로(변조 시 검증 실패 → 아래 fp가
// undefined가 되어 state 소비 자체가 STATE_MISSING/FINGERPRINT_MISMATCH로 거부된다),
// rememberMe도 같은 서명으로 보호된다 — 사용자가 쿠키 값을 직접 바꿔 로그인 유지 선택을
// 조작할 수 없다.
const OAUTH_ATTEMPT_COOKIE = "oauthAttempt";
// socialAuth.service.js의 OAUTH_STATE_TTL_MS(10분, 리다이렉트 왕복 시간만 견디면 되는 값)와
// 맞춘다 — state가 만료되기 전에 이 쿠키도 함께 사라져야 의미가 있다.
const OAUTH_ATTEMPT_TTL_SECONDS = 10 * 60;
// socialAuth.service.js의 SOCIAL_SIGNUP_INTENT_TTL_MS(가입 보완 폼을 채우는 동안 유지되는
// 30분)와 맞춘다 — SIGNUP_REQUIRED로 끝난 뒤에는 이 쿠키를 이 길이로 다시 서명해, 가입
// 보완이 끝날 때까지 원래 rememberMe 선택을 들고 간다(아래 googleAuthCallback 참고).
const SOCIAL_SIGNUP_INTENT_TTL_SECONDS = 30 * 60;

const oauthAttemptCookieOptions = (maxAgeSeconds) => ({
    httpOnly: true,
    sameSite: "Lax",
    secure:   process.env.NODE_ENV === "production",
    maxAge:   maxAgeSeconds * 1000,
});

// payload는 { fp, rememberMe, purpose: "login", provider } 또는 (SIGNUP_REQUIRED 이후)
// { intentToken, rememberMe, purpose: "signup", provider } 중 하나다 — purpose로 두 쓰임을
// 구분해, 콜백이 로그인용 서명을 가입 보완 단계에서 잘못 재사용하지 않게 한다.
//
// F-07: provider("google" | "discord")도 이 서명에 함께 묶는다 — state 자체는 제공자를
// 구분하지 않는 공용 값이라(socialAuth.service.js issueOAuthState/consumeOAuthState는
// purpose만 검사한다), provider 바인딩이 없으면 한 제공자로 시작한 로그인 시도의 서명된
// 쿠키(및 그 쿠키가 실어온 fp)를 다른 제공자의 콜백 라우트에 그대로 들이밀 수 있다. 아래
// googleAuthCallback/discordAuthCallback은 각각 자신의 provider와 정확히 일치하는 쿠키만
// fp·rememberMe의 출처로 신뢰한다 — 불일치하면 fp가 undefined가 되어 STATE_MISSING으로
// 자연스럽게 거부된다(콜백이 서로의 시도를 받아들이지 않는다).
const signOAuthAttempt = (payload, ttlSeconds) =>
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ttlSeconds });

// 서명이 없거나 만료·변조된 쿠키는 조용히 null로 돌려준다 — 호출부가 그 결과(예: fp가
// undefined)로 자연스럽게 STATE_MISSING 등 기존 검증 경로를 타게 둔다. 별도 오류 코드를
// 만들지 않는다.
const verifyOAuthAttempt = (token) => {
    if (typeof token !== "string" || !token) return null;
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return null;
    }
};

exports.signup = async (req, res, next) => {
    try {
        await authService.signup(req.body);
        res.status(200).json({ success: true, message: "회원가입이 완료되었습니다." });
    } catch (error) {
        next(error);
    }
};

// 가입 입력 단계에서 이메일 중복 여부만 미리 확인한다. 최종 저장 여부는 signup()이
// 다시 판단하므로, 여기서 available:true를 받아도 그 사이 다른 요청이 같은 이메일로
// 먼저 가입하면 signup()에서 409로 거부된다.
exports.checkEmail = async (req, res, next) => {
    try {
        const result = await authService.checkEmailAvailability(req.query.email);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

exports.login = async (req, res, next) => {
    try {
        const userAgent = req.headers["user-agent"];
        const reqInfo = {
            ip:         getClientIp(req),
            userAgent:  userAgent,
            deviceType: getDeviceType(userAgent),
        };

        const { user, token, refreshToken, refreshTokenExpiresAt } = await authService.login(req.body, reqInfo);

        res.cookie("accessToken", token, buildSessionCookieOptions(req.body?.rememberMe, refreshTokenExpiresAt));
        if (refreshToken) {
            res.cookie("refreshToken", refreshToken, buildRefreshCookieOptions(refreshTokenExpiresAt));
        } else {
            // 이번 로그인이 로그인 유지를 선택하지 않아 새 갱신 자격을 발급하지 않았더라도,
            // 브라우저에는 이전 로그인 유지 세션이 남긴 영속 refreshToken 쿠키가 여전히
            // 남아있을 수 있다. authService.login()이 이미 이 계정의 이전 세션을 전부
            // 폐기했으므로(markOnlineSessionsOffline) 그 쿠키는 어차피 무효하지만, 지우지
            // 않고 두면 브라우저가 다음 액세스 토큰 만료 시 그 무효 자격으로 갱신을 시도하는
            // 상태가 남는다 — 이번 로그인이 영속 쿠키를 원치 않는다고 명시한 이상, 남아있는
            // 옛 쿠키도 함께 지운다(F-03 R-IMPL #6/AC-02).
            clearRefreshCookie(res);
        }

        res.status(200).json({
            success: true,
            data: {
                user: {
                    uuid:     user.uuid,
                    nickname: user.nickname,
                    role:     user.role,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

exports.me = async (req, res, next) => {
    try {
        res.status(200).json({
            success: true,
            data: {
                uuid: req.user.uuid,
                role: req.user.role,
            },
        });
    } catch (error) {
        next(error);
    }
};

exports.logout = async (req, res, next) => {
    try {
        await userRepository.recordLogout(req.user.uuid, req.user.sessionId);
        clearSessionCookie(res);
        res.status(200).json({ success: true, message: "성공적으로 로그아웃 되었습니다." });
    } catch (error) {
        next(error);
    }
};

// F-05/F-06: 소셜 로그인 최초 인증 이후, 닉네임 등 필수 정보를 보완해 가입을 완료한다.
// rememberMe는 요청 본문이 아니라 googleAuthCallback이 SIGNUP_REQUIRED일 때 다시 서명해 둔
// oauthAttempt 쿠키에서만 읽는다 — 클라이언트가 이 요청의 body에 rememberMe를 실어도 반영되지
// 않는다(F-06 R-IMPL #2: 로그인 시작 시점에 서버가 서명한 선택만 신뢰). 쿠키가 없거나·서명이
// 유효하지 않거나·purpose가 "signup"이 아니거나·intentToken이 지금 제출된 것과 다르면(다른
// 시도의 쿠키를 재사용) 안전한 기본값(false)으로 떨어진다 — 비밀번호 로그인의 기존
// "로그인 유지 미선택" 분기와 같은 이유로 refreshToken 쿠키를 세우지 않고, 남아있을 수 있는
// 이전 영속 refreshToken 쿠키만 지운다.
exports.completeSocialSignup = async (req, res, next) => {
    try {
        const userAgent = req.headers["user-agent"];
        const reqInfo = {
            ip:         getClientIp(req),
            userAgent:  userAgent,
            deviceType: getDeviceType(userAgent),
        };

        const { intentToken, nickname, birthDate } = req.body;

        const attempt = verifyOAuthAttempt(req.cookies?.[OAUTH_ATTEMPT_COOKIE]);
        const rememberMe = attempt?.purpose === "signup"
            && attempt?.intentToken === intentToken
            && attempt?.rememberMe === true;

        const { user, token, refreshToken, refreshTokenExpiresAt } = await socialAuthService.completeSocialSignup({
            intentToken, nickname, birthDate, rememberMe, reqInfo,
        });

        // 가입 보완용 쿠키는 계정이 실제로 만들어진 뒤에만 지운다(CODEX-1 재검토 지적
        // AC-02) — 이전 버전은 서비스 호출 전에 무조건 지웠다: 닉네임 중복(409) 같은
        // 재시도 가능한 실패에도 쿠키가 사라져, 사용자가 같은 화면에서 다시 제출하면
        // rememberMe:true로 시작한 선택이 조용히 false로 떨어졌다. intentToken 자체는
        // 서버가 발급한 값을 그대로 다시 보내야 하므로 재시도에는 아무 문제가 없고, 쿠키가
        // 살아있어야 그 재시도도 원래 선택을 그대로 유지한다.
        res.clearCookie(OAUTH_ATTEMPT_COOKIE, oauthAttemptCookieOptions(SOCIAL_SIGNUP_INTENT_TTL_SECONDS));

        res.cookie("accessToken", token, buildSessionCookieOptions(rememberMe, refreshTokenExpiresAt));
        if (refreshToken) {
            res.cookie("refreshToken", refreshToken, buildRefreshCookieOptions(refreshTokenExpiresAt));
        } else {
            clearRefreshCookie(res);
        }

        res.status(200).json({
            success: true,
            data: {
                user: {
                    uuid:     user.uuid,
                    nickname: user.nickname,
                    role:     user.role,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

// F-06: Google 로그인 시작. 브라우저를 Google 동의 화면으로 곧장 이동시키는 GET 라우트다
// (버튼 클릭 = 이 경로로의 전체 페이지 이동, AC-01). rememberMe는 쿼리로 받는다 — 이 요청
// 자체가 사용자가 방금 누른 "로그인 상태 유지" 체크박스 값을 실어 보내는 유일한 시점이고,
// 이 시점 이후로는 오직 아래에서 세팅하는 쿠키만 신뢰한다(AC-02/A-02).
exports.googleAuthStart = async (req, res, next) => {
    try {
        const rememberMe = req.query.rememberMe === "true";
        const browserFingerprint = crypto.randomBytes(32).toString("base64url");

        const { state } = await socialAuthService.issueOAuthState({ purpose: "login", browserFingerprint });

        const attemptToken = signOAuthAttempt(
            { fp: browserFingerprint, rememberMe, purpose: "login", provider: "google" },
            OAUTH_ATTEMPT_TTL_SECONDS,
        );
        res.cookie(OAUTH_ATTEMPT_COOKIE, attemptToken, oauthAttemptCookieOptions(OAUTH_ATTEMPT_TTL_SECONDS));

        res.redirect(googleOAuthService.buildAuthorizationUrl(state));
    } catch (error) {
        next(error);
    }
};

// F-06: Google 콜백. Google이 사용자를 이 경로로 다시 이동시키며 code·state(정상)나
// error·state(취소)를 실어 온다 — 그래서 이 라우트는 항상 프론트로의 리다이렉트로
// 끝난다(JSON을 돌려주면 브라우저 전체 페이지 이동 한가운데서 그대로 노출된다). 성공하면
// F-05의 공통 계정 조회/생성·세션 발급으로 이어지고(AC-01), 실패하면 자동 병합·세션 발급
// 없이 오류 코드만 실어 로그인 화면으로 되돌린다(AC-04).
//
// R-IMPL #3: state 검증·소비는 Google을 부르기 전에 원자적으로 끝나야 한다 — 그래야
// 위조/불일치/만료/재사용 state는 애초에 Google 네트워크 호출까지 가지 않고, 그 뒤의 코드
// 교환이 실패(네트워크·제공자 오류)해도 이미 커밋된 소비 덕분에 같은 state를 다시 시도할 수
// 없다. 그래서 socialAuthService.handleOAuthCallback(상태 소비+계정 판정을 한 번에 묶는
// 편의 함수) 대신, consumeOAuthState → (필요하면) exchangeCodeForProfile → resolveOAuthAccount
// 세 단계를 이 자리에서 직접 순서대로 호출한다.
exports.googleAuthCallback = async (req, res, next) => {
    const attempt = verifyOAuthAttempt(req.cookies?.[OAUTH_ATTEMPT_COOKIE]);
    // 이 왕복 전용 쿠키는 콜백 한 번으로 수명이 끝난다 — 성공/실패 어느 쪽이든 지운다.
    // SIGNUP_REQUIRED로 끝나면 아래에서 가입 보완용으로 다시(더 긴 TTL로) 세팅한다.
    res.clearCookie(OAUTH_ATTEMPT_COOKIE, oauthAttemptCookieOptions(OAUTH_ATTEMPT_TTL_SECONDS));

    const frontendBase = process.env.FRONTEND_URL;
    const redirectWithError = (code) => res.redirect(`${frontendBase}/login?socialError=${encodeURIComponent(code)}`);

    try {
        const userAgent = req.headers["user-agent"];
        const reqInfo = {
            ip:         getClientIp(req),
            userAgent:  userAgent,
            deviceType: getDeviceType(userAgent),
        };

        // attempt가 null이면(쿠키 없음·서명 위조·만료·purpose 불일치) fp는 undefined다 —
        // 별도로 분기하지 않아도 아래 consumeOAuthState가 STATE_MISSING으로 자연스럽게
        // 거부하므로(browserFingerprint 필수 검증, F-05 socialAuth.service.js), 위조된
        // 시도가 Google을 부르는 일은 없다. provider가 "google"이 아니면(F-07 Discord 시도의
        // 쿠키를 여기로 들이민 경우 포함) 같은 이유로 fp를 내주지 않는다(제공자 바인딩,
        // 위 signOAuthAttempt 주석 참고).
        const browserFingerprint = attempt?.purpose === "login" && attempt?.provider === "google" ? attempt.fp : undefined;
        const rememberMe = attempt?.purpose === "login" && attempt?.provider === "google" && attempt?.rememberMe === true;

        // 1) state 소비를 먼저, 그리고 유일하게 커밋한다 — Google을 부르기 전에 끝난다.
        await socialAuthService.consumeOAuthState(req.query.state, { browserFingerprint, purpose: "login" });

        // Google은 사용자가 동의 화면에서 취소하면 code 대신 error(예: access_denied)를
        // 실어 돌려준다 — 이 경우 코드 교환 자체를 시도하지 않는다(교환할 code가 없다).
        const cancelled = req.query.error !== undefined;
        let subject = null;
        let email = null;
        if (!cancelled) {
            // 2) state가 유효했을 때만 제공자를 부른다. 여기서 실패해도(타임아웃 포함) 위
            // state 소비는 이미 커밋되어 있어 재사용될 수 없다(R-IMPL #3).
            const profile = await googleOAuthService.exchangeCodeForProfile(req.query.code);
            subject = profile.subject;
            email = profile.email;
        }

        // 3) 계정 조회/생성과 세션 발급 — rememberMe를 그대로 넘겨 재로그인이면 정확히
        // 한 번만 세션을 발급한다(R-IMPL #2, 이중 발급 없음).
        const result = await socialAuthService.resolveOAuthAccount({
            provider: "google", subject, email, cancelled, rememberMe, reqInfo,
        });

        if (result.status === "SIGNUP_REQUIRED") {
            // 신규 계정 — 닉네임 등 정보 보완이 끝나야 세션이 생긴다(F-05
            // completeSocialSignup, useSocialSignup.js가 이 intentToken을 그대로 받는다).
            // rememberMe 선택을 그대로 들고 가도록, intentToken에 결합된 서명 쿠키를 가입
            // 보완 창(30분)만큼 다시 세팅한다(R-IMPL #2) — 완료 시점에
            // exports.completeSocialSignup이 이 쿠키를 읽는다.
            const intentAttemptToken = signOAuthAttempt(
                { intentToken: result.intentToken, rememberMe, purpose: "signup", provider: "google" },
                SOCIAL_SIGNUP_INTENT_TTL_SECONDS,
            );
            res.cookie(OAUTH_ATTEMPT_COOKIE, intentAttemptToken, oauthAttemptCookieOptions(SOCIAL_SIGNUP_INTENT_TTL_SECONDS));
            return res.redirect(`${frontendBase}/login?socialIntent=${encodeURIComponent(result.intentToken)}`);
        }

        // status === "LOGIN" (재로그인). resolveOAuthAccount가 이미 rememberMe 그대로 세션을
        // 발급했다 — 여기서는 그 결과를 쿠키로 옮기기만 한다.
        res.cookie("accessToken", result.token, buildSessionCookieOptions(rememberMe, result.refreshTokenExpiresAt));
        if (result.refreshToken) {
            res.cookie("refreshToken", result.refreshToken, buildRefreshCookieOptions(result.refreshTokenExpiresAt));
        } else {
            clearRefreshCookie(res);
        }

        return res.redirect(`${frontendBase}/lobby`);
    } catch (error) {
        // state 누락/위조/만료/재사용, 취소, 이메일 충돌, 제공자 타임아웃 등은 모두 code가
        // 있는 도메인 오류다 — 자동 병합이나 세션 발급 없이 그 code만 실어 로그인 화면으로
        // 돌려보낸다(AC-04). code가 없는 뜻밖의 오류는 global error handler처럼 로그를 남긴
        // 뒤에도 여전히 브라우저 리다이렉트로 마무리한다 — 이 경로는 항상 전체 페이지 이동
        // 중이라 JSON을 응답하면 그대로 화면에 노출된다.
        if (!error?.code) {
            console.error('\x1b[31m%s\x1b[0m', error?.stack || error);
        }
        return redirectWithError(error?.code || "OAUTH_FAILED");
    }
};

// F-07: Discord 로그인 시작. googleAuthStart와 완전히 대칭이다 — provider만 다르다.
exports.discordAuthStart = async (req, res, next) => {
    try {
        const rememberMe = req.query.rememberMe === "true";
        const browserFingerprint = crypto.randomBytes(32).toString("base64url");

        const { state } = await socialAuthService.issueOAuthState({ purpose: "login", browserFingerprint });

        const attemptToken = signOAuthAttempt(
            { fp: browserFingerprint, rememberMe, purpose: "login", provider: "discord" },
            OAUTH_ATTEMPT_TTL_SECONDS,
        );
        res.cookie(OAUTH_ATTEMPT_COOKIE, attemptToken, oauthAttemptCookieOptions(OAUTH_ATTEMPT_TTL_SECONDS));

        res.redirect(discordOAuthService.buildAuthorizationUrl(state));
    } catch (error) {
        next(error);
    }
};

// F-07: Discord 콜백. googleAuthCallback과 완전히 대칭이다(같은 순서·같은 실패 처리,
// R-IMPL #2/#3 그대로 적용) — provider만 다르고, 그 provider 값이 attempt 쿠키 바인딩과
// resolveOAuthAccount 판정 모두에 쓰인다.
exports.discordAuthCallback = async (req, res, next) => {
    const attempt = verifyOAuthAttempt(req.cookies?.[OAUTH_ATTEMPT_COOKIE]);
    res.clearCookie(OAUTH_ATTEMPT_COOKIE, oauthAttemptCookieOptions(OAUTH_ATTEMPT_TTL_SECONDS));

    const frontendBase = process.env.FRONTEND_URL;
    const redirectWithError = (code) => res.redirect(`${frontendBase}/login?socialError=${encodeURIComponent(code)}`);

    try {
        const userAgent = req.headers["user-agent"];
        const reqInfo = {
            ip:         getClientIp(req),
            userAgent:  userAgent,
            deviceType: getDeviceType(userAgent),
        };

        // provider가 "discord"가 아니면(Google 시도의 쿠키를 여기로 들이민 경우 포함) fp를
        // 내주지 않는다 — googleAuthCallback과 같은 제공자 바인딩(signOAuthAttempt 주석 참고).
        const browserFingerprint = attempt?.purpose === "login" && attempt?.provider === "discord" ? attempt.fp : undefined;
        const rememberMe = attempt?.purpose === "login" && attempt?.provider === "discord" && attempt?.rememberMe === true;

        // 1) state 소비를 먼저, 그리고 유일하게 커밋한다 — Discord를 부르기 전에 끝난다.
        await socialAuthService.consumeOAuthState(req.query.state, { browserFingerprint, purpose: "login" });

        // Discord도 사용자가 동의 화면에서 취소하면 code 대신 error를 실어 돌려준다 — 이
        // 경우 코드 교환 자체를 시도하지 않는다(교환할 code가 없다).
        const cancelled = req.query.error !== undefined;
        let subject = null;
        let email = null;
        if (!cancelled) {
            // 2) state가 유효했을 때만 제공자를 부른다. 여기서 실패해도(타임아웃 포함) 위
            // state 소비는 이미 커밋되어 있어 재사용될 수 없다(R-IMPL #3).
            const profile = await discordOAuthService.exchangeCodeForProfile(req.query.code);
            subject = profile.subject;
            email = profile.email;
        }

        // 3) 계정 조회/생성과 세션 발급 — rememberMe를 그대로 넘겨 재로그인이면 정확히
        // 한 번만 세션을 발급한다(R-IMPL #2, 이중 발급 없음).
        const result = await socialAuthService.resolveOAuthAccount({
            provider: "discord", subject, email, cancelled, rememberMe, reqInfo,
        });

        if (result.status === "SIGNUP_REQUIRED") {
            const intentAttemptToken = signOAuthAttempt(
                { intentToken: result.intentToken, rememberMe, purpose: "signup", provider: "discord" },
                SOCIAL_SIGNUP_INTENT_TTL_SECONDS,
            );
            res.cookie(OAUTH_ATTEMPT_COOKIE, intentAttemptToken, oauthAttemptCookieOptions(SOCIAL_SIGNUP_INTENT_TTL_SECONDS));
            return res.redirect(`${frontendBase}/login?socialIntent=${encodeURIComponent(result.intentToken)}`);
        }

        // status === "LOGIN" (재로그인). resolveOAuthAccount가 이미 rememberMe 그대로 세션을
        // 발급했다 — 여기서는 그 결과를 쿠키로 옮기기만 한다.
        res.cookie("accessToken", result.token, buildSessionCookieOptions(rememberMe, result.refreshTokenExpiresAt));
        if (result.refreshToken) {
            res.cookie("refreshToken", result.refreshToken, buildRefreshCookieOptions(result.refreshTokenExpiresAt));
        } else {
            clearRefreshCookie(res);
        }

        return res.redirect(`${frontendBase}/lobby`);
    } catch (error) {
        if (!error?.code) {
            console.error('\x1b[31m%s\x1b[0m', error?.stack || error);
        }
        return redirectWithError(error?.code || "OAUTH_FAILED");
    }
};

// F-05 AC-04/D-01 R-IMPL: 명시적 연결(link) HTTP 핸들러는 여기 두지 않는다. 이 컨트롤러가
// req.body의 provider/subject/email을 그대로 socialAuthService.linkExternalIdentity에
// 전달하면, 로그인한 사용자가 소유권 증명 없이 임의의 소셜 identity를 자기 계정에 선점할 수
// 있다(운영자 코드 검토 R-IMPL — state·세션 검증만으로는 provider/subject 자체의 진위를
// 증명하지 못한다). socialAuthService.issueOAuthState(purpose:"link")·linkExternalIdentity는
// 서버가 OAuth 교환·검증을 마친 결과만 입력으로 받는 내부 전용 계약으로 남겨 두고, F-06/F-07이
// 실제 제공자 검증 어댑터를 완성해 그 검증 결과로만 이 함수들을 호출하는 라우트를 추가할
// 때까지 공개 HTTP 경로는 두지 않는다(backend/routes/auth.routes.js 참고).

// 액세스 토큰이 만료된 뒤(F-03 AC-01) 호출된다. verifyToken을 거치지 않으므로 req.user가
// 없고, 대신 refreshToken 쿠키 자체를 authService.refresh가 검증·회전시킨다.
exports.refresh = async (req, res, next) => {
    try {
        const { accessToken, refreshToken, refreshTokenExpiresAt } = await authService.refresh(req.cookies.refreshToken);

        res.cookie("accessToken", accessToken, buildSessionCookieOptions(true, refreshTokenExpiresAt));
        // authService.refresh()는 정상 회전이든 grace(응답 유실·동시 요청) 복구든 항상 같은
        // 유효한 갱신 자격을 결정론적으로 재현해 돌려준다(F-03 R-IMPL #8) — 그래서 이제
        // refreshToken은 성공 응답에서 항상 값이 있고, 매번 그대로 Set-Cookie해도 안전하다
        // (여러 동시 요청이 모두 같은 값을 계산하므로 서로의 최신 값을 되돌릴 위험이 없다).
        if (refreshToken) {
            res.cookie("refreshToken", refreshToken, buildRefreshCookieOptions(refreshTokenExpiresAt));
        }

        res.status(200).json({ success: true });
    } catch (error) {
        // 갱신 자격이 애초에 무효/만료/폐기됐다면 남아있는 쿠키도 함께 정리해, 클라이언트가
        // 같은 무효 쿠키로 갱신을 반복 시도하지 않게 한다.
        if (error?.status === 401 || error?.status === 403) {
            clearSessionCookie(res);
        }
        next(error);
    }
};
