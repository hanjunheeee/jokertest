// 세션 확인 파일, access 토큰 풀기 · 세션 살아 있나·정지인지 판정
// middlewares/auth.middleware.js·socket/connection/auth.js가 부름 (요청마다·소켓 접속·사건마다·5초마다)
const jwt              = require("jsonwebtoken");
const userRepository    = require("../../repositories/user");

// 서명 틀리거나 만료면 jwt가 던짐, 잡는 건 부르는 쪽 몫
// ignoreExpiration은 로그아웃·디스코드 연결 콜백만 (세션 살아 있는지는 따로 봄)
exports.verifyAccessToken = (token, { ignoreExpiration = false } = {}) => {
    if (ignoreExpiration) {
        return jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    }
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

    // 정지 중이면 그 사람 세션 전부 끊고 403 (소켓은 code로 끊는 까닭 알림)
    if (activeBan) {
        await userRepository.markOnlineSessionsOffline(decoded.uuid);
        return { ok: false, status: 403, code: "ACCOUNT_BANNED", message: `정지된 계정입니다. 사유: ${activeBan.reason || "운영정책 위반"}` };
    }

    // 계정 상태가 ACTIVE 아니면(관리자 비활성 등) 정지와 같은 흐름 (상태 없는 줄은 통과)
    const accountStatus = session.User?.status ?? null;
    if (accountStatus && accountStatus !== "ACTIVE") {
        await userRepository.markOnlineSessionsOffline(decoded.uuid);
        return { ok: false, status: 403, code: "ACCOUNT_INACTIVE", message: "이용할 수 없는 계정입니다." };
    }

    return { ok: true };
};
