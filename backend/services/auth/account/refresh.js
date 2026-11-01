// refresh 파일, refresh 토큰 확인 · 회전 · 재사용 감지
// controllers/auth/session.js가 account 입구로 부름, 재사용이면 그 사람 세션 전부 끊음
const userRepository          = require("../../../repositories/user");
const { generateToken }       = require("../../../utils/auth/credentials");
const { createError }         = require("../../../utils/appError");
const { ACCESS_TOKEN_SHORT_TTL_SECONDS, REFRESH_TOKEN_GRACE_MS, capAccessTokenTtlSeconds } = require("../../../utils/auth/cookieOptions");
const { hashRefreshToken, deriveRotatedToken } = require('./tokens');

// 없음 → 폐기 → 만료 → 정지 → 재사용 → 유효 시간 → 새 토큰 (직전 토큰은 짧은 유예 안에서만 같은 결과)
exports.refresh = async (rawRefreshToken) => {
    // 쿠키 없으면 DB 안 감
    if (!rawRefreshToken) {
        throw createError("갱신 자격이 없습니다. 다시 로그인해주세요.", 401);
    }

    // DB엔 해시만 있어서 해시로 찾음
    const presentedHash = hashRefreshToken(rawRefreshToken);

    // 거절은 type으로 꺼내 밖에서 던짐 (안에서 던지면 정지·재사용 때 세션 끊기가 되돌아감)
    const outcome = await userRepository.withTransaction(async (transaction) => {
        // 지금·직전·밀려난 해시 어느 걸로든 세션 찾고 행 잠금 (같은 토큰 동시 refresh 줄 세움)
        const session = await userRepository.findSessionForRefresh(presentedHash, { transaction });

        // 모르는 토큰·폐기된 세션 거절
        if (!session) return { type: "invalid" };
        if (session.revoked_at) return { type: "revoked" };

        // 로그인 유지 기간 지났으면 거절
        const now = new Date();
        if (!session.refresh_token_expires_at || session.refresh_token_expires_at <= now) {
            return { type: "expired" };
        }

        // 정지 중이면 세션 전부 끊고 거절
        const activeBan = await userRepository.checkActiveBan(session.user_id);
        if (activeBan) {
            await userRepository.markOnlineSessionsOffline(session.user_id, { transaction });
            return { type: "banned", reason: activeBan.reason };
        }

        // 지금 토큰이거나, 유예 시간 안의 직전 토큰만 통과
        const isFreshMatch = session.refresh_token_hash === presentedHash;
        const isGraceMatch = !isFreshMatch
            && session.refresh_previous_hash === presentedHash
            && session.refresh_previous_expires_at
            && session.refresh_previous_expires_at > now;

        // 그 밖(밀려난 옛 토큰·유예 지난 직전 토큰)은 훔친 토큰일 수 있어 세션 전부 끊음
        if (!isFreshMatch && !isGraceMatch) {
            await userRepository.markOnlineSessionsOffline(session.user_id, { transaction });
            return { type: "reuse" };
        }

        // access 유효 시간은 refresh 만료 못 넘게, 남은 시간 없으면 만료
        const cappedTtlSeconds = capAccessTokenTtlSeconds(ACCESS_TOKEN_SHORT_TTL_SECONDS, session.refresh_token_expires_at, now);
        if (cappedTtlSeconds <= 0) return { type: "expired" };

        // 역할은 지금 계정 값으로 넣음
        const user = await userRepository.findByUuid(session.user_id);
        const accessToken = generateToken({
            uuid:      session.user_id,
            role:      user?.role,
            sessionId: session.id,
        }, { expiresIn: cappedTtlSeconds });

        // 직전 토큰이면 다시 회전 안 하고 같은 새 토큰 돌려줌 (응답 놓친 재시도)
        if (isGraceMatch) {
            const recoveredRawToken = deriveRotatedToken(rawRefreshToken, session.id);
            return {
                type: "ok",
                accessToken,
                refreshToken: recoveredRawToken,
                refreshTokenExpiresAt: session.refresh_token_expires_at,
            };
        }

        // 여기부터 진짜 바뀜: 새 토큰으로 회전
        const newRawRefreshToken = deriveRotatedToken(rawRefreshToken, session.id);
        const newHash = hashRefreshToken(newRawRefreshToken);

        // 지금 토큰은 유예 시간까지 직전 토큰으로, 밀려난 직전 토큰은 기록에 남김 (재사용 감지용)
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

    // 거절 종류마다 문구·상태 정해 던짐
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
