// 소셜 가입 컨트롤러 파일, 소셜 가입 마무리 · 가입 의도 확인
// routes/auth.routes.js가 부름, 시도 표의 rememberMe는 같은 가입 의도일 때만 믿음
const socialAuthService = require("../../services/auth/social");
const { getDeviceType, getClientIp } = require("../../utils/request");
const { buildSessionCookieOptions, buildRefreshCookieOptions, clearRefreshCookie } = require("../../utils/auth/cookieOptions");
const { OAUTH_ATTEMPT_COOKIE, attemptCookieOptions } = require('./cookies');
const { verifyOAuthAttempt, INTENT_TTL_SECONDS } = socialAuthService;

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

        const { intentToken, nickname, birthDate, email, signupProof } = req.body ?? {};

        // 로그인 유지는 본문 말고 같은 의도의 시도 쿠키에서만 가져옴
        const attempt = verifyOAuthAttempt(req.cookies?.[OAUTH_ATTEMPT_COOKIE]);
        const rememberMe = socialAuthService.rememberMeForSignup(attempt, intentToken);

        const { user, token, refreshToken, refreshTokenExpiresAt } = await socialAuthService.completeSocialSignup({
            intentToken, nickname, birthDate, email, signupProof, rememberMe, reqInfo,
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

        const { emailVerificationRequired } = await socialAuthService.getSocialSignupIntent({ intentToken });

        res.set("Cache-Control", "no-store");
        res.status(200).json({ success: true, data: { emailVerificationRequired } });
    } catch (error) {
        next(error);
    }
};
