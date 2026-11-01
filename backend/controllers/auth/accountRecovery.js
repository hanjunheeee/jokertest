'use strict';

// 아이디 찾기 컨트롤러 파일, IP 거르기 · 아이디 찾기 응답
// 못 찾아도 200 NOT_FOUND, 오류는 500 (원본 오류 안 보임)
const accountRecoveryService = require('../../services/auth/accountRecovery');
const { getClientIp } = require('../../utils/request');

const IP_PATTERN = /^[0-9a-fA-F:.]{1,45}$/;

const sanitizeIp = (rawIp) => (
    typeof rawIp === 'string' && rawIp.length > 0 && rawIp.length <= 45 && IP_PATTERN.test(rawIp)
        ? rawIp
        : null
);

const findId = async (req, res) => {
    res.set('Cache-Control', 'no-store');

    try {
        const { nickname, birthDate } = res.locals.findIdInput;
        const ipAddress = sanitizeIp(getClientIp(req));

        const result = await accountRecoveryService.findId({ nickname, birthDate, ipAddress });

        if (result.ok) {
            return res.status(200).json({ ok: true, maskedEmail: result.maskedEmail });
        }
        return res.status(200).json({ ok: false, code: 'NOT_FOUND' });
    } catch {
        return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
};

module.exports = { findId };
