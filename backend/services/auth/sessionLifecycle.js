// 세션 확인 파일, access 토큰 풀기 · 세션 살아 있나·정지인지 판정
// middlewares/auth.middleware.js·socket/connection/auth.js가 부름 (요청마다·소켓 접속·사건마다·5초마다)
const jwt              = require("jsonwebtoken");
const userRepository    = require("../../repositories/user");

// 서명 틀리거나 만료면 jwt가 던짐, 잡는 건 부르는 쪽 몫
exports.verifyAccessToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
};

// 토큰 속 세션이 아직 살아 있고 정지 아닌지, 거절은 상태 코드·문구로 돌려줌
exports.resolveSession = async (decoded) => {
    // uuid·세션 id 없는 토큰은 세션 못 찾으므로 바로 거절
    if (!decoded?.uuid || !decoded?.sessionId) {
        return { ok: false, status: 401, message: "유효하지 않거나 만료된 토큰입니다." };
    }

    // 세션·정지 같이 조회 (따로 기다리지 않게)
    const [session, activeBan] = await Promise.all([
        userRepository.findActiveSession(decoded.sessionId, decoded.uuid),
        userRepository.checkActiveBan(decoded.uuid),
    ]);

    // 끊긴 세션이면 401 (is_online은 true·1 둘 다 받음)
    if (!session || (session.is_online !== true && session.is_online !== 1)) {
        return { ok: false, status: 401, message: "세션이 만료되었습니다. 다시 로그인해주세요." };
    }

    // 로그인 유지 세션은 refresh 만료 지나면 access 남아도 거절
    if (session.refresh_token_expires_at && session.refresh_token_expires_at <= new Date()) {
        return { ok: false, status: 401, message: "로그인 유지 기간이 만료되었습니다. 다시 로그인해주세요." };
    }

    // 정지 중이면 그 사람 세션 전부 끊고 403
    if (activeBan) {
        await userRepository.markOnlineSessionsOffline(decoded.uuid);
        return { ok: false, status: 403, message: `정지된 계정입니다. 사유: ${activeBan.reason || "운영정책 위반"}` };
    }

    return { ok: true };
};
