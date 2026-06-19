/**
 * User-Agent 기반 기기 타입 판별 유틸리티.
 *
 * 로그인 이력에 PC/MOBILE/TABLET 값을 남기기 위한 가벼운 분류만 담당합니다.
 */
/**
 * User-Agent 문자열을 분석해 기기 종류를 반환합니다.
 * @param {string} userAgent - 클라이언트 브라우저 User-Agent
 * @returns {'PC'|'MOBILE'|'TABLET'|'UNKNOWN'}
 */
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
};
