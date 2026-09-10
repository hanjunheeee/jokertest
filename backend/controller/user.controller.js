const crypto            = require("crypto");
const authService       = require("../service/auth.service");
const socialAuthService = require("../service/socialAuth.service");
const googleOAuthService = require("../service/googleOAuth.service");
const userRepository    = require("../repositories/user.repositories");
const { getDeviceType } = require("../utils/device");
const { getClientIp }   = require("../utils/ip");
const { buildSessionCookieOptions, buildRefreshCookieOptions, clearSessionCookie, clearRefreshCookie } = require("../auth/cookieOptions");

// F-06: Google OAuth 왕복(시작 → Google 동의 → 콜백) 동안만 살아있는 값 두 가지를 쿠키에
// 담아 보존한다. 둘 다 socialAuth.service.js의 oauth_states 테이블에는 저장할 자리가 없는
// 값이라(스키마 변경은 이 작업 범위 밖) 브라우저에 결합된 쿠키로 왕복시킨다 — state
// 자체의 CSRF·재생 방지는 여전히 F-05의 state·browser_fingerprint 검증이 담당한다:
//   - oauthFp: 이 왕복을 시작한 브라우저를 표시하는 무작위 값. issueOAuthState에
//     browserFingerprint로 그대로 전달되어 state에 결합되므로, 다른 브라우저가 이 state를
//     가로채 콜백을 재현해도 fingerprint 불일치로 거부된다(F-05 A-04).
//   - oauthRememberMe: 로그인 유지 선택. 콜백의 code/state는 Google이 만든 값이라 여기 담을
//     수 없고, 시작 시점에 서버가 세팅한 이 쿠키만 신뢰한다 — 그래서 콜백 쪽 쿼리 파라미터를
//     바꾸는 것만으로는 이미 시작된 시도의 로그인 유지 선택을 바꿀 수 없다(AC-02/A-02).
const OAUTH_FP_COOKIE = "oauthFp";
const OAUTH_REMEMBER_COOKIE = "oauthRememberMe";
// socialAuth.service.js의 OAUTH_STATE_TTL_MS(10분, 리다이렉트 왕복 시간만 견디면 되는 값)와
// 맞춘다 — state가 만료되기 전에 이 쿠키들도 함께 사라져야 의미가 있다.
const OAUTH_ATTEMPT_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;
const oauthAttemptCookieOptions = () => ({
    httpOnly: true,
    sameSite: "Lax",
    secure:   process.env.NODE_ENV === "production",
    maxAge:   OAUTH_ATTEMPT_COOKIE_MAX_AGE_MS,
});

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

// F-05: 소셜 로그인 최초 인증 이후, 닉네임 등 필수 정보를 보완해 가입을 완료한다.
// completeSocialSignup은 항상 rememberMe:false로 세션을 발급하므로(소셜 전용 계정은
// 로그인 유지를 선택할 입력 자체가 없다), login()의 "로그인 유지 미선택" 분기와 같은 이유로
// refreshToken 쿠키를 세우지 않고, 남아있을 수 있는 이전 영속 refreshToken 쿠키만 지운다.
exports.completeSocialSignup = async (req, res, next) => {
    try {
        const userAgent = req.headers["user-agent"];
        const reqInfo = {
            ip:         getClientIp(req),
            userAgent:  userAgent,
            deviceType: getDeviceType(userAgent),
        };

        const { intentToken, nickname, birthDate } = req.body;
        const { user, token, refreshTokenExpiresAt } = await socialAuthService.completeSocialSignup({
            intentToken, nickname, birthDate, reqInfo,
        });

        res.cookie("accessToken", token, buildSessionCookieOptions(false, refreshTokenExpiresAt));
        clearRefreshCookie(res);

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

        res.cookie(OAUTH_FP_COOKIE, browserFingerprint, oauthAttemptCookieOptions());
        res.cookie(OAUTH_REMEMBER_COOKIE, rememberMe ? "1" : "0", oauthAttemptCookieOptions());

        res.redirect(googleOAuthService.buildAuthorizationUrl(state));
    } catch (error) {
        next(error);
    }
};

// F-06: Google 콜백. Google이 사용자를 이 경로로 다시 이동시키며 code·state(정상)나
// error·state(취소)를 실어 온다 — 그래서 이 라우트는 항상 프론트로의 리다이렉트로
// 끝난다(JSON을 돌려주면 브라우저 전체 페이지 이동 한가운데서 그대로 노출된다). 성공하면
// F-05의 공통 계정 조회/생성·세션 발급(handleOAuthCallback)으로 이어지고(AC-01), 실패하면
// 자동 병합·세션 발급 없이 오류 코드만 실어 로그인 화면으로 되돌린다(AC-04).
exports.googleAuthCallback = async (req, res, next) => {
    const browserFingerprint = req.cookies?.[OAUTH_FP_COOKIE];
    const rememberMe = req.cookies?.[OAUTH_REMEMBER_COOKIE] === "1";
    // 이 왕복 전용 쿠키는 콜백 한 번으로 수명이 끝난다 — 성공/실패 어느 쪽이든 지운다.
    res.clearCookie(OAUTH_FP_COOKIE, oauthAttemptCookieOptions());
    res.clearCookie(OAUTH_REMEMBER_COOKIE, oauthAttemptCookieOptions());

    const frontendBase = process.env.FRONTEND_URL;
    const redirectWithError = (code) => res.redirect(`${frontendBase}/login?socialError=${encodeURIComponent(code)}`);

    try {
        const userAgent = req.headers["user-agent"];
        const reqInfo = {
            ip:         getClientIp(req),
            userAgent:  userAgent,
            deviceType: getDeviceType(userAgent),
        };

        // Google은 사용자가 동의 화면에서 취소하면 code 대신 error(예: access_denied)를
        // 실어 돌려준다 — 이 경우 코드 교환 자체를 시도하지 않는다(교환할 code가 없다).
        const cancelled = req.query.error !== undefined;
        let subject = null;
        let email = null;
        if (!cancelled) {
            const profile = await googleOAuthService.exchangeCodeForProfile(req.query.code);
            subject = profile.subject;
            email = profile.email;
        }

        const result = await socialAuthService.handleOAuthCallback({
            provider: "google",
            subject,
            email,
            rawState: req.query.state,
            browserFingerprint,
            cancelled,
            reqInfo,
        });

        if (result.status === "SIGNUP_REQUIRED") {
            // 신규 계정 — 닉네임 등 정보 보완이 끝나야 세션이 생긴다(F-05
            // completeSocialSignup, useSocialSignup.js가 이 intentToken을 그대로 받는다).
            return res.redirect(`${frontendBase}/login?socialIntent=${encodeURIComponent(result.intentToken)}`);
        }

        // status === "LOGIN" (재로그인). handleOAuthCallback은 항상 rememberMe:false로
        // 세션을 발급한다(F-05 socialAuth.service.js 계약, 이 작업 범위 밖) — 사용자가 로그인
        // 유지를 선택했다면(AC-02) F-05와 같은 세션 발급 절차(authService.issueSessionForUser,
        // login()·completeSocialSignup이 재사용하는 그 함수)를 그대로 다시 호출해
        // rememberMe:true로 재발급한다. 이 재발급도 markOnlineSessionsOffline로 시작하므로
        // 방금 만든 rememberMe:false 세션은 활성 상태로 남지 않는다 — 폐기된 세션 행 하나가
        // 감사 기록처럼 남는 것만 감수한다(트랜잭션을 나눠 이중 발급하는 대신 F-05
        // socialAuth.service.js에 rememberMe 인자를 추가하려면 그 파일도 함께 고쳐야 해
        // 이번 작업 범위를 넘어간다).
        let session = result;
        if (rememberMe) {
            session = await authService.issueSessionForUser(result.user, { rememberMe: true }, reqInfo);
        }

        res.cookie("accessToken", session.token, buildSessionCookieOptions(rememberMe, session.refreshTokenExpiresAt));
        if (session.refreshToken) {
            res.cookie("refreshToken", session.refreshToken, buildRefreshCookieOptions(session.refreshTokenExpiresAt));
        } else {
            clearRefreshCookie(res);
        }

        return res.redirect(`${frontendBase}/lobby`);
    } catch (error) {
        // state 누락/위조/만료/재사용, 취소, 이메일 충돌 등은 모두 code가 있는 도메인
        // 오류다(F-05 socialAuth.service.js) — 자동 병합이나 세션 발급 없이 그 code만 실어
        // 로그인 화면으로 돌려보낸다(AC-04). code가 없는 뜻밖의 오류는 global error
        // handler처럼 로그를 남긴 뒤에도 여전히 브라우저 리다이렉트로 마무리한다 — 이 경로는
        // 항상 전체 페이지 이동 중이라 JSON을 응답하면 그대로 화면에 노출된다.
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
