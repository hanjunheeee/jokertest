exports.getClientIp = (req) => {
    const forwardedIpsStr = req.headers['x-forwarded-for'];
    if (forwardedIpsStr) {
        return forwardedIpsStr.split(',')[0].trim();
    }
    return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'UNKNOWN';
}