// 소셜 계정 찾기 파일, 외부 계정 → 로그인 또는 가입 의도 · 콜백 흐름
// 콜백 흐름은 입구 객체로 state 소비·계정 찾기를 부름 (시험 패치 먹게)
const userRepository = require("../../../repositories/user");
const authService = require("../account");
const { createError } = require("../../../utils/appError");
const { generateOpaqueToken, hashValue } = require('./tokens');
const { INTENT_TTL_MS } = require('./constants');

// 연결된 계정 있으면 세션 발급, 없으면 이메일 충돌 확인 뒤 가입 의도 만듦
exports.resolveOAuthAccount = async ({
    provider, subject, email, cancelled, rememberMe = false, reqInfo = {},
}) => {
    if (cancelled === true) {
        throw createError("사용자가 로그인을 취소했습니다.", 400, "OAUTH_CANCELLED");
    }
    if (typeof provider !== "string" || !provider || typeof subject !== "string" || !subject) {
        throw createError("제공자 정보가 올바르지 않습니다.", 400, "PROVIDER_INVALID");
    }

    return await userRepository.withTransaction(async (transaction) => {
        const existingIdentity = await userRepository.findExternalIdentity(
            { provider, subject }, { transaction, lock: transaction.LOCK.UPDATE },
        );

        if (existingIdentity) {
            const user = await userRepository.findByUuid(existingIdentity.user_id, { transaction });
            if (!user) {
                throw createError("연결된 계정을 찾을 수 없습니다.", 404, "LINKED_USER_MISSING");
            }
            const session = await authService.issueSessionForUser(user, { rememberMe: rememberMe === true }, reqInfo, transaction);
            return { status: "LOGIN", user, ...session };
        }

        const verifiedEmail = typeof email === "string" && email.trim() ? email.trim() : null;

        if (verifiedEmail !== null) {
            const existingByEmail = await userRepository.findByEmail(verifiedEmail, { transaction });
            if (existingByEmail) {
                throw createError(
                    "이미 가입된 이메일입니다. 기존 계정으로 로그인한 뒤 소셜 계정을 연결해주세요.",
                    409, "EMAIL_CONFLICT",
                );
            }
        }

        const rawIntentToken = generateOpaqueToken();
        const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
        await userRepository.createSocialSignupIntent({
            intent_token_hash: hashValue(rawIntentToken),
            provider,
            subject,
            email: verifiedEmail,
            expires_at: expiresAt,
        }, { transaction });

        return {
            status: "SIGNUP_REQUIRED",
            intentToken: rawIntentToken,
            email: verifiedEmail,
            emailVerificationRequired: verifiedEmail === null,
            expiresAt,
        };
    });
};

// state 소비 → 계정 찾기
exports.handleOAuthCallback = async ({
    provider, subject, email, rawState, browserFingerprint, cancelled, rememberMe = false, reqInfo = {},
}) => {
    await require('./index').consumeOAuthState(rawState, { browserFingerprint, purpose: "login" });

    return await require('./index').resolveOAuthAccount({ provider, subject, email, cancelled, rememberMe, reqInfo });
};
