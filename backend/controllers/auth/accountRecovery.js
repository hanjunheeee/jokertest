'use strict';

// 아이디 찾기 컨트롤러 파일, IP 거르기 · 아이디 찾기 응답 (결과 캐시 금지)
// routes/auth.routes.js가 검사·요청 수 제한 뒤 부름, 못 찾아도 200 NOT_FOUND · 오류는 500 코드만
const accountRecoveryService = require('../../services/auth/accountRecovery');
const { getClientIp } = require('../../utils/request');

// 기록에 넣을 IP 모양 (IPv4·IPv6 글자만, 45자까지)
const IP_PATTERN = /^[0-9a-fA-F:.]{1,45}$/;

// 모양 이상한 IP는 null (x-forwarded-for 헤더 값이 기록에 그대로 안 들어가게)
const sanitizeIp = (rawIp) => (
    typeof rawIp === 'string' && rawIp.length > 0 && rawIp.length <= 45 && IP_PATTERN.test(rawIp)
        ? rawIp
        : null
);

// 검사 끝난 닉네임·생일로 찾기, 찾으면 가린 이메일만 보냄
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
