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
