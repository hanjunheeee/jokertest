'use strict';

// F-29b: 비밀번호 재설정 HTTP 경계. find-id(accountRecovery.controller.js)와 같은 원칙 —
// 원본 오류(SQL·스택·입력값)를 절대 로깅하거나 next(error)로 넘기지 않는다. 모든 응답에
// no-store를 적용해 토큰이 담긴 응답이 캐시에 남지 않게 한다.

const passwordResetService = require('../service/passwordReset.service');

exports.requestPasswordReset = async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { email } = res.locals.passwordResetInput;
        await passwordResetService.requestPasswordReset({ email });
    } catch {
        // 계정 없음·소셜 전용·발송 실패·예외·설정 누락 전부 같은 공통 응답으로 수렴한다.
    }
    return res.status(200).json({ ok: true });
};

exports.verifyPasswordReset = async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
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

exports.confirmPasswordReset = async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
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
