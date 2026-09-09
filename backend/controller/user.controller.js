const authService       = require("../service/auth.service");
const userRepository    = require("../repositories/user.repositories");
const { getDeviceType } = require("../utils/device");
const { getClientIp }   = require("../utils/ip");
const { buildSessionCookieOptions, clearSessionCookie } = require("../auth/cookieOptions");

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

        const { user, token } = await authService.login(req.body, reqInfo);

        res.cookie("accessToken", token, buildSessionCookieOptions(req.body?.rememberMe));

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
