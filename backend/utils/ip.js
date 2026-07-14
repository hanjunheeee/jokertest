// 요청(req) 객체에서 클라이언트의 IP 주소를 찾아 반환합니다.
exports.getClientIp = (req) => {
    // 서버 앞에 프록시나 로드밸런서가 있으면 실제 클라이언트 IP가 이 헤더에 담길 수 있습니다.
    const forwardedIpsStr = req.headers['x-forwarded-for'];

    if (forwardedIpsStr) {
        // x-forwarded-for에는 "클라이언트 IP, 프록시1 IP, 프록시2 IP"처럼 여러 IP가 들어올 수 있습니다.
        // 보통 가장 앞의 IP가 원래 클라이언트 IP라서 첫 번째 값만 사용합니다.
        return forwardedIpsStr.split(',')[0].trim();
    }

    // 프록시 헤더가 없으면 Express/Node가 제공하는 IP 값들을 순서대로 확인합니다.
    // 어떤 값도 없으면 IP를 알 수 없다는 의미로 "UNKNOWN"을 반환합니다.
    return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'UNKNOWN';
};
