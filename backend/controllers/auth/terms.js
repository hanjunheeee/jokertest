// 약관 컨트롤러 파일, 지금 약관 목록(로그인 전) · 내 재동의 필요 목록 · 재동의 응답
// routes/auth.routes.js(목록)·routes/user.routes.js(재동의)가 부름, 고르기·검사는 services/auth/terms
const termsService = require("../../services/auth/terms");

// 지금 약관 목록 (가입 화면·전체 보기 창, 로그인 필요 없음)
exports.getCurrentTerms = async (req, res, next) => {
    try {
        const terms = await termsService.getCurrentTerms();
        res.status(200).json({ success: true, data: { terms } });
    } catch (error) {
        next(error);
    }
};

// 내 재동의 필요 목록 (비면 할 일 없음, 로그인 뒤 화면이 부름)
exports.getMyPendingTerms = async (req, res, next) => {
    try {
        const pending = await termsService.getPendingTerms(req.user.uuid);
        res.set("Cache-Control", "no-store");
        res.status(200).json({ success: true, data: { pending, reconsentRequired: pending.length > 0 } });
    } catch (error) {
        next(error);
    }
};

// 재동의: 본문 { agreedTermsVersionIds: [id] } → 남은 필요 목록
exports.agreeMyTerms = async (req, res, next) => {
    try {
        const { pending } = await termsService.agreeToTerms(req.user.uuid, req.body?.agreedTermsVersionIds);
        res.status(200).json({ success: true, data: { pending, reconsentRequired: pending.length > 0 } });
    } catch (error) {
        next(error);
    }
};
