// 세션 컨트롤러 파일, 내 정보 · 로그아웃 · refresh
// routes/auth.routes.js가 부름, refresh 실패(401·403)면 세션 쿠키 지움
const authService       = require("../../services/auth/account");
const { buildSessionCookieOptions, buildRefreshCookieOptions, clearSessionCookie } = require("../../utils/auth/cookieOptions");

// 내 정보: DB 안 읽고 토큰 속 uuid·role만 (세션 확인은 verifyToken에서 끝남)
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

// 로그아웃: 기록 남기고 그 세션 끊은 뒤 access·refresh 쿠키 둘 다 지움
exports.logout = async (req, res, next) => {
    try {
        await authService.logout({ uuid: req.user.uuid, sessionId: req.user.sessionId });
        clearSessionCookie(res);
        res.status(200).json({ success: true, message: "성공적으로 로그아웃 되었습니다." });
    } catch (error) {
        next(error);
    }
};

// refresh 쿠키로 새 access·refresh 쿠키 (refresh는 로그인 유지 때만 있어서 access도 유지 옵션)
exports.refresh = async (req, res, next) => {
    try {
        const { accessToken, refreshToken, refreshTokenExpiresAt } = await authService.refresh(req.cookies.refreshToken);

        res.cookie("accessToken", accessToken, buildSessionCookieOptions(true, refreshTokenExpiresAt));
        if (refreshToken) {
            res.cookie("refreshToken", refreshToken, buildRefreshCookieOptions(refreshTokenExpiresAt));
        }

        res.status(200).json({ success: true });
    } catch (error) {
        // 없음·폐기·만료·재사용·정지면 쿠키 지움 (다시 로그인하게)
        if (error?.status === 401 || error?.status === 403) {
            clearSessionCookie(res);
        }
        next(error);
    }
};
