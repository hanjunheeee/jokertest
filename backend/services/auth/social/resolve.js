// 소셜 계정 찾기 파일, 외부 계정 → 로그인 또는 가입 의도 · 콜백 흐름
// social 입구로 social/googleLogin.js·discordLogin.js가 부름 (handleOAuthCallback은 시험만 부름)
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
    // 취소·제공자 정보 없음은 DB 가기 전에 거절
    if (cancelled === true) {
        throw createError("사용자가 로그인을 취소했습니다.", 400, "OAUTH_CANCELLED");
    }
    if (typeof provider !== "string" || !provider || typeof subject !== "string" || !subject) {
        throw createError("제공자 정보가 올바르지 않습니다.", 400, "PROVIDER_INVALID");
    }

    return await userRepository.withTransaction(async (transaction) => {
        // 외부 계정 찾고 행 잠금, 연결돼 있으면 바로 로그인
        const existingIdentity = await userRepository.findExternalIdentity(
            { provider, subject }, { transaction, lock: transaction.LOCK.UPDATE },
        );

        if (existingIdentity) {
            // 연결은 있는데 계정 행이 없으면 404
            const user = await userRepository.findByUuid(existingIdentity.user_id, { transaction });
            if (!user) {
                throw createError("연결된 계정을 찾을 수 없습니다.", 404, "LINKED_USER_MISSING");
            }
            // 같은 트랜잭션에서 세션 발급 (account 입구 객체로 불러 시험 패치 먹게)
            const session = await authService.issueSessionForUser(user, { rememberMe: rememberMe === true }, reqInfo, transaction);
            return { status: "LOGIN", user, ...session };
        }

        // 제공자가 확인한 이메일만 씀, 없으면 가입 때 이메일 인증 받음
        const verifiedEmail = typeof email === "string" && email.trim() ? email.trim() : null;

        // 그 이메일로 이미 가입한 계정 있으면 409 (남의 계정 가로채기 막기, 로그인 뒤 연결하게)
        if (verifiedEmail !== null) {
            const existingByEmail = await userRepository.findByEmail(verifiedEmail, { transaction });
            if (existingByEmail) {
                throw createError(
                    "이미 가입된 이메일입니다. 기존 계정으로 로그인한 뒤 소셜 계정을 연결해주세요.",
                    409, "EMAIL_CONFLICT",
                );
            }
        }

        // 여기부터 진짜 바뀜: 가입 의도 저장 (DB엔 해시만, 원래 값은 응답으로만)
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

// state 소비 → 계정 찾기 (지금은 시험만 부름)
exports.handleOAuthCallback = async ({
    provider, subject, email, rawState, browserFingerprint, cancelled, rememberMe = false, reqInfo = {},
}) => {
    await require('./index').consumeOAuthState(rawState, { browserFingerprint, purpose: "login" });

    return await require('./index').resolveOAuthAccount({ provider, subject, email, cancelled, rememberMe, reqInfo });
};
