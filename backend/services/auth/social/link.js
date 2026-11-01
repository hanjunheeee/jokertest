// 소셜 계정 연결 파일, 로그인한 세션에 외부 계정 붙이기
// state 확인 뒤 연결은 입구 객체로 state 소비 부름
const userRepository = require("../../../repositories/user.repositories");
const { createError } = require("../../../utils/appError");

// 세션 살아 있나 → 이미 다른 계정에 붙었나 → 붙임 (같은 계정이면 그대로)
const linkExternalIdentityForValidatedSession = async ({ userId, sessionId, provider, subject, email }) => {
    if (!userId || !sessionId) {
        throw createError("로그인이 필요합니다.", 401);
    }
    if (typeof provider !== "string" || !provider || typeof subject !== "string" || !subject) {
        throw createError("제공자 정보가 올바르지 않습니다.", 400, "PROVIDER_INVALID");
    }

    return await userRepository.withTransaction(async (transaction) => {
        const activeSession = await userRepository.findActiveSession(sessionId, userId);
        if (!activeSession) {
            throw createError("세션이 만료되었거나 폐기되었습니다. 다시 로그인해주세요.", 401, "SESSION_REVOKED");
        }

        const existing = await userRepository.findExternalIdentity(
            { provider, subject }, { transaction, lock: transaction.LOCK.UPDATE },
        );
        if (existing) {
            if (existing.user_id !== userId) {
                throw createError("이미 다른 계정에 연결된 소셜 계정입니다.", 409, "IDENTITY_ALREADY_LINKED");
            }
            return existing;
        }

        return await userRepository.createExternalIdentity({
            provider,
            subject,
            user_id: userId,
            email_snapshot: typeof email === "string" && email.trim() ? email.trim() : null,
        }, { transaction });
    });
};

exports.linkExternalIdentityForValidatedSession = linkExternalIdentityForValidatedSession;

// state 소비 → state 발급 세션과 같은지 → 연결
exports.linkExternalIdentity = async ({ userId, sessionId, provider, subject, email, rawState, browserFingerprint }) => {
    if (!userId || !sessionId) {
        throw createError("로그인이 필요합니다.", 401);
    }

    const consumed = await require('./index').consumeOAuthState(rawState, { browserFingerprint, purpose: "link" });
    if (consumed.userId !== userId || consumed.sessionId !== sessionId) {
        throw createError("연결 요청 세션과 state 발급 세션이 일치하지 않습니다.", 400, "STATE_USER_MISMATCH");
    }

    return linkExternalIdentityForValidatedSession({ userId, sessionId, provider, subject, email });
};
