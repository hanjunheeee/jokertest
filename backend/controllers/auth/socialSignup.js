// 소셜 가입 컨트롤러 파일, 소셜 가입 마무리 · 가입 의도 확인
// routes/auth.routes.js가 부름, 시도 표의 rememberMe는 같은 가입 의도일 때만 믿음
const socialAuthService = require("../../services/auth/social");
const { getDeviceType, getClientIp } = require("../../utils/request");
const { buildSessionCookieOptions, buildRefreshCookieOptions, clearRefreshCookie } = require("../../utils/auth/cookieOptions");
const { OAUTH_ATTEMPT_COOKIE, attemptCookieOptions } = require('./cookies');
const { createError } = require("../../utils/appError");
const { verifyOAuthAttempt, INTENT_TTL_SECONDS } = socialAuthService;

// 이 브라우저가 받은 가입 시도 쿠키 없으면 거절 (남이 만든 ?socialIntent= 링크로 가입하면 그 사람 소셜 계정에 묶임)
// 화면이 만료 화면으로 가게 INTENT_EXPIRED로 답함
// 의도 토큰 자체가 없으면 그대로 서비스가 INTENT_INVALID로 거절
const assertSignupAttempt = (attempt, intentToken) => {
    if (typeof intentToken !== "string" || !intentToken) return;
    if (!socialAuthService.isSignupAttemptFor(attempt, intentToken)) {
        throw createError("가입 가능 시간이 만료되었거나 다른 브라우저에서 연 가입 링크입니다. 다시 로그인해주세요.", 400, "INTENT_EXPIRED");
    }
};

// 가입 마무리 → 시도 쿠키 지움 → 세션 쿠키
exports.completeSocialSignup = async (req, res, next) => {
    try {
        // 세션 행에 넣을 ip·기기 정보
        const userAgent = req.headers["user-agent"];
        const reqInfo = {
            ip:         getClientIp(req),
            userAgent:  userAgent,
            deviceType: getDeviceType(userAgent),
        };

        const {
            intentToken, nickname, birthDate, email, signupProof, agreedTermsVersionIds, ageConfirmed,
        } = req.body ?? {};

        // 로그인 유지는 본문 말고 같은 의도의 시도 쿠키에서만 가져옴
        const attempt = verifyOAuthAttempt(req.cookies?.[OAUTH_ATTEMPT_COOKIE]);
        assertSignupAttempt(attempt, intentToken);
        const rememberMe = socialAuthService.rememberMeForSignup(attempt, intentToken);

        const { user, token, refreshToken, refreshTokenExpiresAt } = await socialAuthService.completeSocialSignup({
            intentToken, nickname, birthDate, email, signupProof, agreedTermsVersionIds, ageConfirmed, rememberMe, reqInfo,
        });

        // 가입 끝났을 때만 시도 쿠키 지움 (실패면 남겨서 다시 시도 가능)
        res.clearCookie(OAUTH_ATTEMPT_COOKIE, attemptCookieOptions(INTENT_TTL_SECONDS));

        // 로그인 유지 아니면 지난 refresh 쿠키 지움
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

// 가입 칸 열 때 이메일 인증 필요한지만 알려 줌 (캐시 금지)
exports.getSocialSignupIntent = async (req, res, next) => {
    try {
        const { intentToken } = req.body ?? {};
        assertSignupAttempt(verifyOAuthAttempt(req.cookies?.[OAUTH_ATTEMPT_COOKIE]), intentToken);

        const { emailVerificationRequired } = await socialAuthService.getSocialSignupIntent({ intentToken });

        res.set("Cache-Control", "no-store");
        res.status(200).json({ success: true, data: { emailVerificationRequired } });
    } catch (error) {
        next(error);
    }
};
