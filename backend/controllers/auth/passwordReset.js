'use strict';

// 비밀번호 재설정 컨트롤러 파일, 메일 요청 · 링크 확인 · 새 비번 저장 응답 (전부 캐시 금지)
// routes/auth.routes.js가 부름, 메일 요청은 오류를 삼키고 늘 200 (가입 여부 숨김), 나머지 오류는 500
const passwordResetService = require('../../services/auth/passwordReset');

// 메일 요청: 검사 끝난 주소로 보냄, 결과 상관없이 같은 200
exports.requestPasswordReset = async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { email } = res.locals.passwordResetInput;
        await passwordResetService.requestPasswordReset({ email });
    } catch {
        // 실패해도 늘 같은 200 (가입 여부 숨김)
    }
    return res.status(200).json({ ok: true });
};

// 링크 확인: 토큰 안 씀 (메일 미리보기가 열어도 무해), 무효·사용됨·만료도 200에 code로
exports.verifyPasswordReset = async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        // 문자열 토큰만 넘김 (?token= 여러 번이면 배열로 옴)
        const token = typeof req.query?.token === 'string' ? req.query.token : undefined;
        const result = await passwordResetService.verifyPasswordReset(token);
        if (result.ok) {
            return res.status(200).json({ ok: true, status: 'VALID' });
        }
        return res.status(200).json({ ok: false, code: result.code });
    } catch {
        return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
};

// 새 비번 저장: 토큰 쓰고 비번 바꿈, 실패는 서비스가 준 상태·code로
exports.confirmPasswordReset = async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        // 문자열 아닌 값은 undefined로 넘겨 서비스가 거절
        const body = req.body ?? {};
        const token = typeof body.token === 'string' ? body.token : undefined;
        const newPassword = typeof body.newPassword === 'string' ? body.newPassword : undefined;

        const result = await passwordResetService.confirmPasswordReset(token, newPassword);
        if (result.ok) {
            return res.status(200).json({ ok: true });
        }
        return res.status(result.status ?? 400).json({ ok: false, code: result.code });
    } catch {
        return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
};
