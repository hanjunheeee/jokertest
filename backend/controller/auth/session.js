// 세션 컨트롤러 파일, 내 정보 · 로그아웃 · refresh
// refresh 실패(401·403)면 세션 쿠키 지움
const authService       = require("../../services/auth/account");
const { buildSessionCookieOptions, buildRefreshCookieOptions, clearSessionCookie } = require("../../auth/cookieOptions");

// 토큰 속 uuid·role만
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

// 로그아웃 기록 뒤 세션 쿠키 지움
exports.logout = async (req, res, next) => {
    try {
        await authService.logout({ uuid: req.user.uuid, sessionId: req.user.sessionId });
        clearSessionCookie(res);
        res.status(200).json({ success: true, message: "성공적으로 로그아웃 되었습니다." });
    } catch (error) {
        next(error);
    }
};

// refresh 쿠키로 새 access(+새 refresh) 쿠키
exports.refresh = async (req, res, next) => {
    try {
        const { accessToken, refreshToken, refreshTokenExpiresAt } = await authService.refresh(req.cookies.refreshToken);

        res.cookie("accessToken", accessToken, buildSessionCookieOptions(true, refreshTokenExpiresAt));
        if (refreshToken) {
            res.cookie("refreshToken", refreshToken, buildRefreshCookieOptions(refreshTokenExpiresAt));
        }

        res.status(200).json({ success: true });
    } catch (error) {
        if (error?.status === 401 || error?.status === 403) {
            clearSessionCookie(res);
        }
        next(error);
    }
};
