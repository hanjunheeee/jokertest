// 기기 종류 판별 유틸리티
/**
 * @desc    User-Agent 문자열을 분석하여 접속한 기기의 종류를 판별합니다.
 * 로그인 접속 히스토리 기록 및 보안 관리에 주로 사용됩니다.
 * @param   {String} userAgent - 클라이언트 브라우저의 User-Agent 헤더 값
 * @returns {String} 판별된 기기 종류 ('PC', 'MOBILE', 'TABLET', 'UNKNOWN')
 */
exports.getDeviceType = (userAgent) => {
    // User-Agent 값이 아예 넘어오지 않은 경우의 예외 처리
    if(!userAgent) return 'UNKNOWN';
    const ua = userAgent.toLowerCase();

    // 태블릿 판별 (iPad, 모바일이 아닌 Android 기기 등)
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
        return 'TABLET';
    }
    
    // 모바일(스마트폰) 판별 (iPhone, Android 스마트폰 등)
    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
        return 'MOBILE';
    }
    
    // 위의 모바일 및 태블릿 정규식에 걸리지 않는 나머지는 전부 PC로 간주
    return 'PC';
}