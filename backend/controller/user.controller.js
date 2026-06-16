/**
 * @file    user.controller.js
 * @desc    회원가입 · 로그인 · 세션 검증 · 로그아웃 요청을 처리하는 컨트롤러입니다.
 *          req/res 계층만 담당하며, 실제 비즈니스 로직은 auth.service.js에 위임합니다.
 *
 *  응답 포맷 표준
 *  ┌────────────────────────────────────────────────────────────────┐
 *  │  성공  200  { success: true,  data?: any, message?: string }   │
 *  │  에러  4xx  { success: false, message: string }  ← 글로벌핸들러│
 *  └────────────────────────────────────────────────────────────────┘
 *  에러는 모두 next(error)로 글로벌 에러 핸들러에 위임합니다.
 *  컨트롤러 내부에서 직접 에러 응답을 내보내지 않습니다.
 */

const authService       = require("../service/auth.service");
const { getDeviceType } = require("../utils/device");
const { getClientIp }   = require("../utils/ip");

// ──────────────────────────────────────────────
// 회원가입
// ──────────────────────────────────────────────

/**
 * @route   POST /auth/signup
 * @access  Public
 * @body    { email, password, nickname }
 * @returns 200 { success: true, message }  |  next(error)
 */
exports.signup = async (req, res, next) => {
    try {
        await authService.signup(req.body);
        res.status(200).json({ success: true, message: "회원가입이 완료되었습니다." });
    } catch (error) {
        next(error);
    }
};

// ──────────────────────────────────────────────
// 로그인
// ──────────────────────────────────────────────

/**
 * @route   POST /auth/login
 * @access  Public
 * @body    { email, password }
 * @returns 200 { success: true, data: { user } }  |  next(error) → 401
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

        // JWT를 HttpOnly 쿠키로 발급 — JS에서 직접 접근 불가 → XSS 방어
        res.cookie("accessToken", token, {
            httpOnly: true,
            secure:   process.env.NODE_ENV === "production",
            sameSite: "Lax",
            maxAge:   1000 * 60 * 60 * 24, // 24시간
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
        // 잘못된 비밀번호, 잠긴 계정 등 비즈니스 로직 에러는 401로 처리
        error.status = 401;
        next(error);
    }
};

// ──────────────────────────────────────────────
// 세션 검증
// ──────────────────────────────────────────────

/**
 * @route   GET /auth/me
 * @access  Private (verifyToken)
 * @returns 200 { success: true, data: { uuid, role } }  |  next(error)
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

// ──────────────────────────────────────────────
// 로그아웃
// ──────────────────────────────────────────────

/**
 * @route   POST /auth/logout
 * @access  Private
 * @returns 200 { success: true, message }  |  next(error)
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
