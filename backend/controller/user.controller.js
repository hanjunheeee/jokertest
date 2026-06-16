/**
 * @file user.controller.js
 * @desc 회원가입 · 로그인 · 세션 검증 · 로그아웃 컨트롤러
 */

const authService       = require("../service/auth.service");
const { getDeviceType } = require("../utils/device");
const { getClientIp }   = require("../utils/ip");

/**
 * @route   POST /auth/signup
 * @access  Public
 * @param   {Object} req.body - { email, password, nickname }
 */
exports.signup = async (req, res, next) => {
    try {
        await authService.signup(req.body);
        res.status(200).json({ success: true, message: "회원가입이 완료되었습니다." });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   POST /auth/login
 * @access  Public
 * @param   {Object} req.body - { email, password }
 * @returns {Object} { success, data: { user } }
 */
exports.login = async (req, res, next) => {
    try {
        const userAgent = req.headers["user-agent"];
        const reqInfo = {
            ip:         getClientIp(req),
            userAgent:  userAgent,
            deviceType: getDeviceType(userAgent),
        };

        const { user, token } = await authService.login(req.body, reqInfo);

        // JS에서 직접 접근 불가능한 HttpOnly 쿠키로 발급 → XSS 방어
        res.cookie("accessToken", token, {
            httpOnly: true,
            secure:   process.env.NODE_ENV === "production",
            sameSite: "Lax",
            maxAge:   1000 * 60 * 60 * 24,
        });

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
        error.status = 401;
        next(error);
    }
};

/**
 * @route   GET /auth/me
 * @access  Private (verifyToken)
 * @returns {Object} { success, data: { uuid, role } }
 */
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

/**
 * @route   POST /auth/logout
 * @access  Private
 */
exports.logout = async (req, res, next) => {
    try {
        res.clearCookie("accessToken", {
            httpOnly: true,
            secure:   process.env.NODE_ENV === "production",
            sameSite: "Lax",
        });
        res.status(200).json({ success: true, message: "성공적으로 로그아웃 되었습니다." });
    } catch (error) {
        next(error);
    }
};
