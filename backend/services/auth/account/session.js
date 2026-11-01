// 세션 발급 파일, 옛 접속 세션 끊고 새 세션 행 + access 토큰
// 로그인·소셜 로그인·소셜 가입이 트랜잭션 안에서 부름
const userRepository          = require("../../../repositories/user.repositories");
const { generateToken }       = require("../../../utils/jwt");
const { PERSISTENT_SESSION_MAX_AGE_MS, ACCESS_TOKEN_SHORT_TTL_SECONDS, capAccessTokenTtlSeconds } = require("../../../auth/cookieOptions");
const crypto                  = require("crypto");
const { generateRefreshSecret, hashRefreshToken } = require('./tokens');

// 로그인 유지면 refresh도 만들고 access 유효 시간을 refresh 만료에 맞춤
exports.issueSessionForUser = async (user, { rememberMe = false } = {}, reqInfo = {}, transaction) => {
    await userRepository.markOnlineSessionsOffline(user.uuid, { transaction });

    const sessionId = crypto.randomUUID();
    const now = new Date();

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
