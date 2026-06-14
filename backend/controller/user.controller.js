/**
 * @file    user.controller.js
 * @desc    회원가입 · 로그인 · 세션 검증 · 로그아웃 요청을 처리하는 컨트롤러입니다.
 *          req/res 계층만 담당하며, 실제 비즈니스 로직은 auth.service.js에 위임합니다.
 */

const authService    = require("../service/auth.service");
const { getDeviceType } = require("../utils/device");
const { getClientIp }   = require("../utils/ip");

// ──────────────────────────────────────────────
// 회원가입
// ──────────────────────────────────────────────

/**
 * @desc    신규 유저 회원가입 컨트롤러
 *          클라이언트가 보낸 이메일·비밀번호·닉네임을 서비스 계층으로 전달하고
 *          가입 성공 여부를 201 또는 에러로 응답합니다.
 *
 * @route   POST /auth/signup
 * @access  Public
 * @param   {Object} req.body  { email, password, nickname }
 * @returns {Object} 201 { message }  |  next(error)
 */
exports.signup = async (req, res, next) => {
    try {
        await authService.signup(req.body);
        res.status(201).json({ message: "회원가입이 완료되었습니다." });
    } catch (error) {
        next(error);
    }
};

// ──────────────────────────────────────────────
// 로그인
// ──────────────────────────────────────────────

/**
 * @desc    로그인 컨트롤러
 *          계정 상태(잠금·정지) 확인 → 비밀번호 검증 → 접속 기록 저장 → JWT 쿠키 발급 순으로 처리됩니다.
 *          성공 시 accessToken을 HttpOnly 쿠키로 심어 XSS 탈취를 방지합니다.
 *
 * @route   POST /auth/login
 * @access  Public
 * @param   {Object} req.body     { email, password }
 * @param   {Object} req.headers  User-Agent (기기 종류 판별용)
 * @returns {Object} 200 { message, user: { uuid, nickname, role } }  |  401 { message }
 */
exports.login = async (req, res, next) => {
    try {
        const userAgent = req.headers["user-agent"];
        const reqInfo = {
            ip:         getClientIp(req),        // 클라이언트의 실제 IP
            userAgent:  userAgent,               // 원본 User-Agent 문자열
            deviceType: getDeviceType(userAgent), // 파싱된 기기 종류 (PC / MOBILE / TABLET)
        };

        const { user, token } = await authService.login(req.body, reqInfo);

        // JWT를 HttpOnly 쿠키로 발급 — JS에서 직접 접근 불가 → XSS 방어
        res.cookie("accessToken", token, {
            httpOnly: true,
            secure:   process.env.NODE_ENV === "production", // HTTPS 환경에서만 전송
            sameSite: "Lax",                                  // CSRF 공격 방어
            maxAge:   1000 * 60 * 60 * 24,                   // 유효기간: 24시간
        });

        res.status(200).json({
            message: "로그인 성공!",
            user: {
                uuid:     user.uuid,
                nickname: user.nickname,
                role:     user.role,
            },
        });
    } catch (error) {
        console.error("\x1b[31m[로그인 컨트롤러 에러]\x1b[0m", error);
        res.status(401).json({ message: error.message });
    }
};

// ──────────────────────────────────────────────
// 세션 검증
// ──────────────────────────────────────────────

/**
 * @desc    현재 쿠키(JWT)의 유효성을 검증하는 컨트롤러
 *          verifyToken 미들웨어를 통과한 경우에만 여기까지 도달합니다.
 *          프론트엔드 LoginPage가 "쿠키가 실제로 살아있는지" 확인할 때 호출합니다.
 *          → 유효하면 200(로비로 이동), 유효하지 않으면 401(apiClient가 logout 처리)
 *
 * @route   GET /auth/me
 * @access  Private (verifyToken)
 * @returns {Object} 200 { uuid, role }
 */
exports.me = async (req, res, next) => {
    try {
        res.status(200).json({
            uuid: req.user.uuid,
            role: req.user.role,
        });
    } catch (error) {
        next(error);
    }
};

// ──────────────────────────────────────────────
// 로그아웃
// ──────────────────────────────────────────────

/**
 * @desc    로그아웃 컨트롤러
 *          브라우저에 심어진 accessToken 쿠키를 삭제하여 인증 상태를 해제합니다.
 *          프론트엔드는 이 API 호출 후 Zustand 스토어도 직접 초기화해야 합니다.
 *
 * @route   POST /auth/logout  (라우터 등록 시 연결)
 * @access  Private
 * @returns {Object} 200 { message }  |  500 { message }
 */
exports.logout = async (req, res, next) => {
    try {
        res.clearCookie("accessToken", {
            httpOnly: true,
            secure:   process.env.NODE_ENV === "production",
            sameSite: "Lax",
        });
        res.status(200).json({ message: "성공적으로 로그아웃 되었습니다." });
    } catch (error) {
        res.status(500).json({ message: "로그아웃 처리 중 에러가 발생했습니다." });
    }
};
