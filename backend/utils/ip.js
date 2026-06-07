// 클라이언트 IP 추출 유틸리티
/**
 * @desc    클라이언트의 실제 접속 IP 주소를 추출합니다.
 * 프록시(Proxy)나 로드밸런서(AWS ELB, Nginx 등)를 거쳐 요청이 들어올 경우를 대비해
 * 'x-forwarded-for' 헤더를 우선적으로 확인하여 진짜 원본 IP를 찾아냅니다.
 * @param   {Object} req - Express 요청 객체
 * @returns {String} 추출된 클라이언트의 IP 주소 (찾을 수 없으면 'UNKNOWN')
 */
exports.getClientIp = (req) => {
    // 프록시 환경에서는 여러 IP가 쉼표(,)로 구분되어 들어올 수 있습니다. (예: "clientIP, proxy1, proxy2")
    const forwardedIpsStr = req.headers['x-forwarded-for'];
    if (forwardedIpsStr) {
        // 배열의 가장 첫 번째 값이 최초 요청자(원본 클라이언트)의 IP입니다.
        return forwardedIpsStr.split(',')[0].trim();
    }

    // 프록시를 거치지 않은 직접 요청인 경우, Express 기본값 및 Node.js 소켓 정보에서 순차적으로 추출합니다.
    return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'UNKNOWN';
}