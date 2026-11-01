// 요청 정보 읽기 파일, 기기 종류(PC·모바일·태블릿) + 접속 IP 꺼내기
// 로그인·소셜 로그인·아이디 찾기 컨트롤러가 부름
exports.getDeviceType = (userAgent) => {
    if (!userAgent) return 'UNKNOWN';

    const ua = userAgent.toLowerCase();

    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
        return 'TABLET';
    }

    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
        return 'MOBILE';
    }

    return 'PC';
}

exports.getClientIp = (req) => {
    const forwardedIpsStr = req.headers['x-forwarded-for'];

    if (forwardedIpsStr) {
        return forwardedIpsStr.split(',')[0].trim();
    }

    return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'UNKNOWN';
};
