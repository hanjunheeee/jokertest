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

    // 로그인 유지(rememberMe) 세션만 refresh_token_expires_at을 갖는다. 액세스 JWT의 exp는
    // 이 기한을 넘지 않게 발급 시점에 이미 잘려 있지만(cookieOptions.capAccessTokenTtlSeconds),
    // Socket.IO는 handshake 이후 이 JWT를 다시 검증하지 않고 decoded payload를 그대로
    // 재사용한다 — 연결이 30일 넘게 유지되면 JWT exp 검사 자체가 다시 일어나지 않으므로,
    // 매 보호 이벤트마다 통과하는 이 DB 조회에서 절대 기한 초과를 직접 거부해야
    // 한다(F-03 R-IMPL #4).
    if (session.refresh_token_expires_at && session.refresh_token_expires_at <= new Date()) {
        return { ok: false, status: 401, message: "로그인 유지 기간이 만료되었습니다. 다시 로그인해주세요." };
    }

    if (activeBan) {
        // 정지가 감지된 시점에 이 계정의 모든 세션(및 갱신 자격)을 영구 폐기한다 — 밴이
        // 나중에 해제돼도 밴 이전에 발급된 세션이 되살아나지 않게 하기 위해서다. checkActiveBan
        // 통과 거부만으로는 이 요청의 세션만 막을 뿐, 같은 계정의 다른 기존 세션은
        // revoked_at이 없는 채로 남아 있다가 밴 해제 후 다시 유효해진다(F-03 R-IMPL #7).
        await userRepository.markOnlineSessionsOffline(decoded.uuid);
        return { ok: false, status: 403, message: `정지된 계정입니다. 사유: ${activeBan.reason || "운영정책 위반"}` };
    }

    return { ok: true };
};
