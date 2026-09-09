const authService       = require("../service/auth.service");
const userRepository    = require("../repositories/user.repositories");
const { getDeviceType } = require("../utils/device");
const { getClientIp }   = require("../utils/ip");
const { buildSessionCookieOptions, buildRefreshCookieOptions, clearSessionCookie } = require("../auth/cookieOptions");

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

        const { user, token, refreshToken } = await authService.login(req.body, reqInfo);

        res.cookie("accessToken", token, buildSessionCookieOptions(req.body?.rememberMe));
        if (refreshToken) {
            res.cookie("refreshToken", refreshToken, buildRefreshCookieOptions());
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

// 액세스 토큰이 만료된 뒤(F-03 AC-01) 호출된다. verifyToken을 거치지 않으므로 req.user가
// 없고, 대신 refreshToken 쿠키 자체를 authService.refresh가 검증·회전시킨다.
exports.refresh = async (req, res, next) => {
    try {
        const { accessToken, refreshToken } = await authService.refresh(req.cookies.refreshToken);

        res.cookie("accessToken", accessToken, buildSessionCookieOptions(true));
        res.cookie("refreshToken", refreshToken, buildRefreshCookieOptions());

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
