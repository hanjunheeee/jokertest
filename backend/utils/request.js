// 요청 정보 읽기 파일, 기기 종류(PC·모바일·태블릿) + 접속 IP 꺼내기 + 로그용 경로
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

// 기록 칸(STRING(45))에 맞는 IP 모양 (IPv4·IPv6 글자만)
const IP_PATTERN = /^[0-9a-fA-F:.]{1,45}$/;

// 접속 IP, Express req.ip 그대로 (trust proxy 설정대로 믿을 프록시가 붙인 값만 씀)
// x-forwarded-for 맨 앞은 사람이 마음대로 넣을 수 있어 안 읽음, 모양 이상하거나 45자 넘으면 UNKNOWN (저장 실패 500 막기)
exports.getClientIp = (req) => {
    const raw = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;
    if (typeof raw !== 'string' || !IP_PATTERN.test(raw)) return 'UNKNOWN';
    return raw;
};

// 요청 로그에 남길 주소: 쿼리 문자열 뺀 경로만 (?email=·code·state 같은 값 안 남기기)
exports.safeRequestPath = (req) => String(req.originalUrl || req.url || '').split('?')[0];
