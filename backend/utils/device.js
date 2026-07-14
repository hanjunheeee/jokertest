// 브라우저/앱이 보낸 User-Agent 문자열을 보고 접속 기기 종류를 추정합니다.
exports.getDeviceType = (userAgent) => {
    // User-Agent가 없으면 기기를 판단할 수 없으므로 UNKNOWN을 반환합니다.
    if (!userAgent) return 'UNKNOWN';

    // 대소문자 차이 때문에 매칭이 실패하지 않도록 전부 소문자로 바꿉니다.
    const ua = userAgent.toLowerCase();

    // 태블릿 관련 키워드가 있거나, Android인데 mobile 키워드가 없으면 태블릿으로 봅니다.
    // 태블릿도 mobile 키워드를 포함하는 경우가 있어서 모바일보다 먼저 검사합니다.
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
        return 'TABLET';
    }

    // 휴대폰 관련 키워드가 있으면 모바일로 판단합니다.
    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
        return 'MOBILE';
    }

    // 태블릿/모바일 조건에 걸리지 않으면 기본적으로 PC로 판단합니다.
    return 'PC';
}
