const jwt              = require("jsonwebtoken");
const userRepository    = require("../repositories/user.repositories");

// HTTP(auth.middleware.js)와 Socket.IO(socket.js의 authenticateSocket)가 이 두 함수를
// 그대로 공유한다. 검증 로직이 갈라져 있으면 한쪽만 고치고 잊었을 때 폐기된 세션이나
// 정지된 계정이 다른 경로로는 계속 통과하는 사고가 난다(F-03 AC-05).
exports.verifyAccessToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
};

// 서명이 유효한 토큰이라도 현재 서버 상태(세션 폐기, 운영 밴)에 따라 거부할 수 있어야
// 하므로, 매 호출마다 캐시 없이 DB를 재조회한다. 두 조회는 서로 독립적이라 병렬로 묶는다.
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

    if (activeBan) {
        return { ok: false, status: 403, message: `정지된 계정입니다. 사유: ${activeBan.reason || "운영정책 위반"}` };
    }

    return { ok: true };
};
