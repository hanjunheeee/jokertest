// 세션 발급 파일, 그 사람 기존 세션 끊고 새 세션 행 + access 토큰
// account/login.js·social/resolve.js·social/signup.js가 account 입구로 트랜잭션 안에서 부름
const userRepository          = require("../../../repositories/user");
const { generateToken }       = require("../../../utils/auth/credentials");
const { PERSISTENT_SESSION_MAX_AGE_MS, ACCESS_TOKEN_SHORT_TTL_SECONDS, capAccessTokenTtlSeconds } = require("../../../utils/auth/cookieOptions");
const crypto                  = require("crypto");
const { generateRefreshSecret, hashRefreshToken } = require('./tokens');

// 로그인 유지면 refresh 만들고 access는 짧게 (refresh 만료 못 넘게), 아니면 refresh 없이 access 1일
exports.issueSessionForUser = async (user, { rememberMe = false } = {}, reqInfo = {}, transaction) => {
    // 한 사람 한 세션: 기존 세션 먼저 전부 끊음
    await userRepository.markOnlineSessionsOffline(user.uuid, { transaction });

    // 세션 id는 access 토큰에 넣어 요청마다 세션 확인에 씀
    const sessionId = crypto.randomUUID();
    const now = new Date();

    // 로그인 유지일 때만 refresh, DB엔 해시만 저장
    let refreshToken = null;
    let refreshTokenHash = null;
    let refreshTokenExpiresAt = null;
    if (rememberMe === true) {
        refreshToken = generateRefreshSecret();
        refreshTokenHash = hashRefreshToken(refreshToken);
        refreshTokenExpiresAt = new Date(now.getTime() + PERSISTENT_SESSION_MAX_AGE_MS);
    }

    await userRepository.createUserSession({
        id:                       sessionId,
        user_id:                  user.uuid,
        ip_address:               reqInfo.ip,
        is_online:                true,
        refresh_token_hash:       refreshTokenHash,
        refresh_token_expires_at: refreshTokenExpiresAt,
    }, { transaction });

    const token = generateToken({
        uuid:      user.uuid,
        role:      user.role,
        sessionId: sessionId,
    }, {
        expiresIn: rememberMe === true
            ? capAccessTokenTtlSeconds(ACCESS_TOKEN_SHORT_TTL_SECONDS, refreshTokenExpiresAt, now)
            : "1d",
    });

    return { token, refreshToken, refreshTokenExpiresAt };
};
