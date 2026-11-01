// 이메일·비번 계정 컨트롤러 파일, 가입 · 이메일 중복 확인 · 로그인 응답
// routes/auth.routes.js가 부름 (검사·잠금·세션 발급은 services/auth/account)
const authService       = require("../../services/auth/account");
const { getDeviceType, getClientIp } = require("../../utils/request");
const { buildSessionCookieOptions, buildRefreshCookieOptions, clearRefreshCookie } = require("../../utils/auth/cookieOptions");

// 가입: 입력 검사·인증 증명 소비·중복 확인은 서비스 몫, 끝나면 200
exports.signup = async (req, res, next) => {
    try {
        await authService.signup(req.body);
        res.status(200).json({ success: true, message: "회원가입이 완료되었습니다." });
    } catch (error) {
        next(error);
    }
};

// 가입 전 이메일 중복 확인 (쓸 수 있는지만 돌려줌)
exports.checkEmail = async (req, res, next) => {
    try {
        const result = await authService.checkEmailAvailability(req.query.email);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

// 로그인 서비스 → access 쿠키, 로그인 유지면 refresh 쿠키 아니면 지움
exports.login = async (req, res, next) => {
    try {
        // 로그인 기록·세션 행에 넣을 ip·기기 정보
        const userAgent = req.headers["user-agent"];
        const reqInfo = {
            ip:         getClientIp(req),
            userAgent:  userAgent,
            deviceType: getDeviceType(userAgent),
        };

        const { user, token, refreshToken, refreshTokenExpiresAt } = await authService.login(req.body, reqInfo);

        // 로그인 유지 아니면 지난 로그인의 refresh 쿠키가 남지 않게 지움
        res.cookie("accessToken", token, buildSessionCookieOptions(req.body?.rememberMe, refreshTokenExpiresAt));
        if (refreshToken) {
            res.cookie("refreshToken", refreshToken, buildRefreshCookieOptions(refreshTokenExpiresAt));
        } else {
            clearRefreshCookie(res);
        }

        // 응답엔 uuid·닉네임·role만 (토큰은 쿠키로만)
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
