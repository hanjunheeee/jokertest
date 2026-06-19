/**
 * 요청에서 클라이언트 IP를 추출하는 유틸리티.
 *
 * Express trust proxy 설정과 함께 사용되며 로그인 이력/보안 로그 기록에 쓰입니다.
 */
/**
 * 클라이언트의 실제 접속 IP 주소를 추출합니다.
 * @param {import('express').Request} req - Express 요청 객체
 * @returns {string}
 */
exports.getClientIp = (req) => {
    const forwardedIpsStr = req.headers['x-forwarded-for'];
    if (forwardedIpsStr) {
        return forwardedIpsStr.split(',')[0].trim();
    }

    return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'UNKNOWN';
};
