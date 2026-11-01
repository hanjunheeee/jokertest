// refresh 파일, refresh 토큰 확인 · 회전 · 재사용 감지
// 재사용이면 모든 세션 끊음, 오류 문구는 경우마다 정해짐
const userRepository          = require("../../../repositories/user");
const { generateToken }       = require("../../../utils/auth/credentials");
const { createError }         = require("../../../utils/appError");
const { ACCESS_TOKEN_SHORT_TTL_SECONDS, REFRESH_TOKEN_GRACE_MS, capAccessTokenTtlSeconds } = require("../../../utils/auth/cookieOptions");
const { hashRefreshToken, deriveRotatedRefreshToken } = require('./tokens');

// 없음 → 폐기 → 만료 → 정지 → 재사용 → 유효 시간 → 새 토큰 (직전 토큰은 짧은 유예 안에서만 같은 결과)
exports.refresh = async (rawRefreshToken) => {
    if (!rawRefreshToken) {
        throw createError("갱신 자격이 없습니다. 다시 로그인해주세요.", 401);
    }

    const presentedHash = hashRefreshToken(rawRefreshToken);

    const outcome = await userRepository.withTransaction(async (transaction) => {
        const session = await userRepository.findSessionForRefresh(presentedHash, { transaction });

        if (!session) return { type: "invalid" };
        if (session.revoked_at) return { type: "revoked" };

        const now = new Date();
        if (!session.refresh_token_expires_at || session.refresh_token_expires_at <= now) {
            return { type: "expired" };
        }

        const activeBan = await userRepository.checkActiveBan(session.user_id);
        if (activeBan) {
            await userRepository.markOnlineSessionsOffline(session.user_id, { transaction });
            return { type: "banned", reason: activeBan.reason };
        }

        const isFreshMatch = session.refresh_token_hash === presentedHash;
        const isGraceMatch = !isFreshMatch
            && session.refresh_previous_hash === presentedHash
            && session.refresh_previous_expires_at
            && session.refresh_previous_expires_at > now;

        if (!isFreshMatch && !isGraceMatch) {
            await userRepository.markOnlineSessionsOffline(session.user_id, { transaction });
            return { type: "reuse" };
        }

        const cappedTtlSeconds = capAccessTokenTtlSeconds(ACCESS_TOKEN_SHORT_TTL_SECONDS, session.refresh_token_expires_at, now);
        if (cappedTtlSeconds <= 0) return { type: "expired" };

        const user = await userRepository.findByUuid(session.user_id);
        const accessToken = generateToken({
            uuid:      session.user_id,
            role:      user?.role,
            sessionId: session.id,
        }, { expiresIn: cappedTtlSeconds });

        if (isGraceMatch) {
            const recoveredRawRefreshToken = deriveRotatedRefreshToken(rawRefreshToken, session.id);
            return {
                type: "ok",
                accessToken,
                refreshToken: recoveredRawRefreshToken,
                refreshTokenExpiresAt: session.refresh_token_expires_at,
            };
        }

        const newRawRefreshToken = deriveRotatedRefreshToken(rawRefreshToken, session.id);
        const newHash = hashRefreshToken(newRawRefreshToken);

        await userRepository.applyRefreshRotation(session.id, {
            newHash,
            previousHash: session.refresh_token_hash,
            previousExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_GRACE_MS),
            evictedHash: session.refresh_previous_hash,
        }, { transaction });

        return {
            type: "ok",
            accessToken,
            refreshToken: newRawRefreshToken,
            refreshTokenExpiresAt: session.refresh_token_expires_at,
        };
    });

    switch (outcome.type) {
        case "invalid":
            throw createError("유효하지 않은 갱신 자격입니다. 다시 로그인해주세요.", 401);
        case "revoked":
            throw createError("세션이 폐기되었습니다. 다시 로그인해주세요.", 401);
        case "expired":
            throw createError("로그인 유지 기간이 만료되었습니다. 다시 로그인해주세요.", 401);
        case "banned":
            throw createError(`정지된 계정입니다. 사유: ${outcome.reason || "운영정책 위반"}`, 403);
        case "reuse":
            throw createError("갱신 자격 재사용이 감지되어 모든 세션이 종료되었습니다. 다시 로그인해주세요.", 401);
        default:
            return {
                accessToken: outcome.accessToken,
                refreshToken: outcome.refreshToken,
                refreshTokenExpiresAt: outcome.refreshTokenExpiresAt,
            };
    }
};
