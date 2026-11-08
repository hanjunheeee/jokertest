// 회원 관리 컨트롤러 파일, 내 계정 정보(이메일·비번 유무) · 회원 탈퇴 · 이메일 바꾸기(번호 보내기·확인) 응답
// routes/user.routes.js가 부름, 탈퇴는 services/auth/account, 이메일 바꾸기는 services/auth/emailChange
const authService        = require("../../services/auth/account");
const emailChangeService = require("../../services/auth/emailChange");
const userRepository     = require("../../repositories/user");
const { clearSessionCookie } = require("../../utils/auth/cookieOptions");

// 앱이 정한 오류(코드 있음)는 남은 횟수·기다릴 초까지 실어 답함, 나머지는 공통 처리기로
const replyAppError = (res, error, next) => {
    const isAppError = error?.name === "AppError" && typeof error.code === "string";
    // 500대는 메일 실패(503)만 그대로 답함 (나머지 500대는 내부 문구 숨기게 공통 처리기로)
    const exposable = isAppError && ((error.status ?? 500) < 500 || error.code === "MAIL_SEND_FAILED");
    if (!exposable) return next(error);
    const body = { success: false, code: error.code, message: error.message };
    if (error.attemptsRemaining !== undefined) body.attemptsRemaining = error.attemptsRemaining;
    if (error.resendAfterSec !== undefined) body.resendAfterSec = error.resendAfterSec;
    res.set("Cache-Control", "no-store");
    return res.status(error.status).json(body);
};

// 내 계정 정보: 이메일·비번 있는 계정인지 (탈퇴·이메일 바꾸기 창이 본인 확인 칸을 고름)
exports.getMyAccount = async (req, res, next) => {
    try {
        const user = await userRepository.findByUuid(req.user.uuid, { logging: false });
        if (!user) return res.status(404).json({ success: false, message: "유저를 찾을 수 없습니다." });
        res.set("Cache-Control", "no-store");
        res.status(200).json({ success: true, data: { email: user.email, hasLocalPassword: user.has_local_password !== false } });
    } catch (error) {
        next(error);
    }
};

// 탈퇴: 본문 { password } 또는 소셜 전용은 { confirmEmail } → 성공하면 세션 쿠키 지움
exports.withdraw = async (req, res, next) => {
    try {
        const { password, confirmEmail } = req.body ?? {};
        await authService.withdrawAccount({ uuid: req.user.uuid, password, confirmEmail });
        clearSessionCookie(res);
        res.status(200).json({ success: true, message: "회원 탈퇴가 완료되었습니다." });
    } catch (error) {
        replyAppError(res, error, next);
    }
};

// 이메일 바꾸기 번호 보내기: 본문 { newEmail, currentPassword? }
exports.requestEmailChange = async (req, res, next) => {
    try {
        const { newEmail, currentPassword } = req.body ?? {};
        const result = await emailChangeService.requestEmailChangeCode({ uuid: req.user.uuid, newEmail, currentPassword });
        res.set("Cache-Control", "no-store");
        res.status(200).json({ success: true, data: { expiresInSec: result.expiresInSec, resendAfterSec: result.resendAfterSec } });
    } catch (error) {
        replyAppError(res, error, next);
    }
};

// 이메일 바꾸기 확인: 본문 { newEmail, code } → 바뀐 이메일
exports.confirmEmailChange = async (req, res, next) => {
    try {
        const { newEmail, code } = req.body ?? {};
        const result = await emailChangeService.confirmEmailChange({ uuid: req.user.uuid, newEmail, code });
        res.set("Cache-Control", "no-store");
        res.status(200).json({ success: true, data: { email: result.email }, message: "이메일이 변경되었습니다." });
    } catch (error) {
        replyAppError(res, error, next);
    }
};
