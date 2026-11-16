// 세션 확인 파일, access 토큰 풀기 · 세션 살아 있나·정지인지 판정
// middlewares/auth.middleware.js·socket/connection/auth.js가 부름 (요청마다·소켓 접속·사건마다·5초마다)
const jwt              = require("jsonwebtoken");
const userRepository    = require("../../repositories/user");
const sessionCheckRepository = require("../../repositories/user/sessionCheck");

// 서명 방식은 HS256 하나만 받음 (다른 방식으로 바꿔 서명한 토큰 막기)
const ACCESS_TOKEN_ALGORITHMS = ["HS256"];

// 서명 틀리거나 만료면 jwt가 던짐, 잡는 건 부르는 쪽 몫
// ignoreExpiration은 로그아웃·디스코드 연결 콜백만 (세션 살아 있는지는 따로 봄)
// 같은 키로 서명한 소셜 시도 표(purpose 칸 있음)는 로그인 토큰으로 안 받음
exports.verifyAccessToken = (token, { ignoreExpiration = false } = {}) => {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ACCESS_TOKEN_ALGORITHMS,
        ...(ignoreExpiration ? { ignoreExpiration: true } : {}),
    });
    if (decoded && typeof decoded === "object" && decoded.purpose !== undefined) {
        throw new jwt.JsonWebTokenError("access token expected");
    }
    return decoded;
};

// 정지 거절 글 (사유 없으면 운영정책 위반)
const banMessageOf = (ban) => `정지된 계정입니다. 사유: ${ban.reason || "운영정책 위반"}`;

// 끊긴 세션 거절 글
const SESSION_EXPIRED_MESSAGE = "세션이 만료되었습니다. 다시 로그인해주세요.";

// 토큰 속 세션이 아직 살아 있고 정지 아닌지, 거절은 상태 코드·문구로 돌려줌
// batch: 소켓 쪽(접속·사건·5초 주기)만 켬, 세션·계정 상태·정지를 질의 하나로 + 같은 차례 확인 여럿을 한 번에 물음
// (http 요청 확인은 옛 두 질의 그대로, 판정은 둘 다 아래 같은 줄)
exports.resolveSession = async (decoded, { batch = false } = {}) => {
    // uuid·세션 id 없는 토큰은 세션 못 찾으므로 바로 거절
    if (!decoded?.uuid || !decoded?.sessionId) {
        return { ok: false, status: 401, message: "유효하지 않거나 만료된 토큰입니다." };
    }

    // 세션·정지 같이 조회 (따로 기다리지 않게)
    const [session, activeBan, gone] = batch
        ? await sessionCheckRepository.loadSessionCheck(decoded.sessionId, decoded.uuid)
        : await Promise.all([
            userRepository.findActiveSession(decoded.sessionId, decoded.uuid),
            userRepository.checkActiveBan(decoded.uuid),
        ]);

    // 끊긴 세션이면 401 (is_online은 true·1 둘 다 받음)
    if (!session || (session.is_online !== true && session.is_online !== 1)) {
        // 탈퇴·새 로그인에 밀린 소켓이면 까닭을 실어 줌 (화면이 "세션 만료" 대신 탈퇴·다른 로그인 안내를 띄움)
        // 둘은 소켓 쪽(batch)만 옴: http 요청 응답은 그대로
        if (gone?.withdrawn) {
            return { ok: false, status: 401, code: "ACCOUNT_WITHDRAWN", message: "회원 탈퇴가 완료되었습니다." };
        }
        // 정지 중이면 세션이 이미 끊겼어도 정지 까닭으로 (아래 정지 거절과 같은 글, http·소켓 같음)
        // 정지 직후 요청 여럿 중 하나가 먼저 세션을 끊어도 나머지가 401로 빠져 정지 안내 없이 로그인 화면으로 가던 것 막기
        // 받는 쪽은 그 토큰을 가진 본인뿐이라 정지 글을 실어도 됨
        const ban = gone?.ban ?? activeBan;
        if (ban) {
            return { ok: false, status: 403, code: "ACCOUNT_BANNED", message: banMessageOf(ban) };
        }
        // 같은 사람 살아 있는 다른 세션 = 새 로그인에 밀림 (글은 소켓 쪽이 다른 로그인 안내로 바꿔 보냄, 결정 MN-064)
        if (gone?.replaced) {
            return { ok: false, status: 401, code: "REPLACED_BY_OTHER_LOGIN", message: SESSION_EXPIRED_MESSAGE };
        }
        return { ok: false, status: 401, message: SESSION_EXPIRED_MESSAGE };
    }

    // 로그인 유지 세션은 refresh 만료 지나면 access 남아도 거절
    if (session.refresh_token_expires_at && session.refresh_token_expires_at <= new Date()) {
        return { ok: false, status: 401, message: "로그인 유지 기간이 만료되었습니다. 다시 로그인해주세요." };
    }

    // 정지 중이면 그 사람 세션 전부 끊고 403 (소켓은 code로 끊는 까닭 알림)
    if (activeBan) {
        await userRepository.markOnlineSessionsOffline(decoded.uuid);
        return { ok: false, status: 403, code: "ACCOUNT_BANNED", message: banMessageOf(activeBan) };
    }

    // 계정 상태가 ACTIVE 아니면(관리자 비활성 등) 정지와 같은 흐름 (상태 없는 줄은 통과)
    const accountStatus = session.User?.status ?? null;
    if (accountStatus && accountStatus !== "ACTIVE") {
        await userRepository.markOnlineSessionsOffline(decoded.uuid);
        return { ok: false, status: 403, code: "ACCOUNT_INACTIVE", message: "이용할 수 없는 계정입니다." };
    }

    return { ok: true };
};
