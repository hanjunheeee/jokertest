const jwt              = require("jsonwebtoken");
const userRepository    = require("../repositories/user.repositories");

exports.verifyAccessToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
};

exports.resolveSession = async (decoded) => {
    if (!decoded?.uuid || !decoded?.sessionId) {
        return { ok: false, status: 401, message: "유효하지 않거나 만료된 토큰입니다." };
    }

    const [session, activeBan] = await Promise.all([
        userRepository.findActiveSession(decoded.sessionId, decoded.uuid),
        userRepository.checkActiveBan(decoded.uuid),
    ]);

    if (!session || (session.is_online !== true && session.is_online !== 1)) {
        return { ok: false, status: 401, message: "세션이 만료되었습니다. 다시 로그인해주세요." };
    }

    if (session.refresh_token_expires_at && session.refresh_token_expires_at <= new Date()) {
        return { ok: false, status: 401, message: "로그인 유지 기간이 만료되었습니다. 다시 로그인해주세요." };
    }

    if (activeBan) {
        await userRepository.markOnlineSessionsOffline(decoded.uuid);
        return { ok: false, status: 403, message: `정지된 계정입니다. 사유: ${activeBan.reason || "운영정책 위반"}` };
    }

    return { ok: true };
};
