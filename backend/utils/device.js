exports.getDeviceType = (userAgent) => {
    if(!userAgent) return 'UNKNOWN';
    const ua = userAgent.toLowerCase();

    // 태블릿 판별
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
        return 'TABLET';
    }
    // 모바일(스마트폰) 판별
    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
        return 'MOBILE';
    }
    // 나머지는 전부 PC
    return 'PC';
}