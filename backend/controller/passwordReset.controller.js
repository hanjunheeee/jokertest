'use strict';

const passwordResetService = require('../service/passwordReset.service');

exports.requestPasswordReset = async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { email } = res.locals.passwordResetInput;
        await passwordResetService.requestPasswordReset({ email });
    } catch {
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
