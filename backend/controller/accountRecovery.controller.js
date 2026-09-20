'use strict';

// F-29a: 아이디 찾기 HTTP 경계. 응답은 오직 {ok:true,maskedEmail} 또는
// {ok:false,code:'NOT_FOUND'} 둘 뿐이고, 예외는 원본 오류(SQL·스택·입력값)를 절대 로깅하거나
// next(error)로 넘기지 않는다 — 그 경로를 타면 backend/middleware/errorHandler.js의 기존
// globalErrorHandler가 err.stack을 로그로 남기고 err.message를 응답에 실어, 이 엔드포인트가
// 지키려는 "전체 이메일·UUID·전화번호가 응답 어디에도 없다"는 계약을 깨뜨릴 수 있다(AC-03).
const accountRecoveryService = require('../service/accountRecovery.service');
const { getClientIp } = require('../utils/ip');

// getClientIp가 만들어낼 수 있는 IPv4/IPv6/UNKNOWN 형태만 저장한다 — 형식이 이상하거나
// account_find_requests.ip_address(STRING(45))보다 긴 값은 저장하지 않고 null로 남긴다.
const IP_PATTERN = /^[0-9a-fA-F:.]{1,45}$/;

const sanitizeIp = (rawIp) => (
    typeof rawIp === 'string' && rawIp.length > 0 && rawIp.length <= 45 && IP_PATTERN.test(rawIp)
        ? rawIp
        : null
);

const findId = async (req, res) => {
    // 이 응답은 절대 캐시되면 안 된다 — 마스킹된 이메일 힌트가 프록시·브라우저 캐시에
    // 남아 다른 요청에서 재사용되는 것을 막는다.
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
        // 원본 오류를 로그·응답 어디에도 남기지 않는다 — 고정된 코드만 돌려준다.
        return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
};

module.exports = { findId };
