// 요청 정보 읽기 파일, 기기 종류(PC·모바일·태블릿) + 접속 IP 꺼내기
// 로그인·소셜 로그인(구글·디스코드)·소셜 가입·아이디 찾기 컨트롤러가 부름

// 브라우저 정보로 기기 종류 (로그인 기록용), 태블릿을 모바일보다 먼저 봄 (모바일 아닌 안드로이드는 태블릿)
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

// 접속 IP, 프록시 거쳐 왔으면 x-forwarded-for 맨 앞 (처음 보낸 사람)
exports.getClientIp = (req) => {
    const forwardedIpsStr = req.headers['x-forwarded-for'];

    if (forwardedIpsStr) {
        return forwardedIpsStr.split(',')[0].trim();
    }

    return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'UNKNOWN';
};
