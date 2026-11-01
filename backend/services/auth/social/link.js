// 소셜 계정 연결 파일, 로그인한 세션에 외부 계정 붙이기
// social 입구로 social/discordLink.js가 부름 (state까지 보는 linkExternalIdentity는 시험만 부름)
const userRepository = require("../../../repositories/user");
const { createError } = require("../../../utils/appError");

// 세션 살아 있나 → 이미 다른 계정에 붙었나 → 붙임 (같은 계정이면 그대로)
const linkExternalIdentityForValidatedSession = async ({ userId, sessionId, provider, subject, email }) => {
    // 로그인·제공자 정보 없으면 DB 안 감
    if (!userId || !sessionId) {
        throw createError("로그인이 필요합니다.", 401);
    }
    if (typeof provider !== "string" || !provider || typeof subject !== "string" || !subject) {
        throw createError("제공자 정보가 올바르지 않습니다.", 400, "PROVIDER_INVALID");
    }

    return await userRepository.withTransaction(async (transaction) => {
        // 연결 시작 뒤 그사이 끊긴 세션이면 거절
        const activeSession = await userRepository.findActiveSession(sessionId, userId);
        if (!activeSession) {
            throw createError("세션이 만료되었거나 폐기되었습니다. 다시 로그인해주세요.", 401, "SESSION_REVOKED");
        }

        // 외부 계정 행 잠가서 동시 연결 겹치지 않게
        const existing = await userRepository.findExternalIdentity(
            { provider, subject }, { transaction, lock: transaction.LOCK.UPDATE },
        );
        // 남의 계정에 붙은 외부 계정이면 409, 내 계정이면 그대로 (두 번 눌러도 됨)
        if (existing) {
            if (existing.user_id !== userId) {
                throw createError("이미 다른 계정에 연결된 소셜 계정입니다.", 409, "IDENTITY_ALREADY_LINKED");
            }
            return existing;
        }

        // 여기부터 진짜 바뀜: 외부 계정 연결 (이메일은 그때 값만 기록)
        return await userRepository.createExternalIdentity({
            provider,
            subject,
            user_id: userId,
            email_snapshot: typeof email === "string" && email.trim() ? email.trim() : null,
        }, { transaction });
    });
};

exports.linkExternalIdentityForValidatedSession = linkExternalIdentityForValidatedSession;

// state 소비 → state 발급 세션과 같은지 → 연결 (state 소비는 입구 객체로 불러 시험 패치 먹게)
exports.linkExternalIdentity = async ({ userId, sessionId, provider, subject, email, rawState, browserFingerprint }) => {
    // 로그인 안 했으면 state 소비 전에 거절
    if (!userId || !sessionId) {
        throw createError("로그인이 필요합니다.", 401);
    }

    // 연결 시작한 세션과 다르면 거절 (남의 연결 state 끼워 넣기 막기)
    const consumed = await require('./index').consumeOAuthState(rawState, { browserFingerprint, purpose: "link" });
    if (consumed.userId !== userId || consumed.sessionId !== sessionId) {
        throw createError("연결 요청 세션과 state 발급 세션이 일치하지 않습니다.", 400, "STATE_USER_MISMATCH");
    }

    return linkExternalIdentityForValidatedSession({ userId, sessionId, provider, subject, email });
};
