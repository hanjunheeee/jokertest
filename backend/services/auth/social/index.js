const crypto = require("crypto");
const userRepository = require("../../../repositories/user.repositories");
const authService = require("../account");
const { hashPassword } = require("../../../utils/hash");
const { createError } = require("../../../utils/appError");
const { validateNickname, validateBirthDate } = require("../../../validation/signupValidation");
const db = require("../../../models");
const economyService = require("../../economy");
const signupEmailVerificationService = require("../signupEmailVerification");
const {
    normalizeEmail: normalizeSignupEmail, validateEmailFormat,
} = require("../../../validation/signupEmailVerificationValidation");

const generateOpaqueToken = () => crypto.randomBytes(32).toString("base64url");
const hashValue = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SOCIAL_SIGNUP_INTENT_TTL_MS = 30 * 60 * 1000;

const VALID_PURPOSES = new Set(["login", "link"]);

exports.issueOAuthState = async ({ purpose, userId = null, sessionId = null, browserFingerprint }) => {
    if (!VALID_PURPOSES.has(purpose)) {
        throw createError("state 발급 목적이 올바르지 않습니다.", 400);
    }
    if (purpose === "link") {
        if (!userId || !sessionId) {
            throw createError("계정 연결을 위한 state는 로그인한 사용자만 발급할 수 있습니다.", 400);
        }
        const activeSession = await userRepository.findActiveSession(sessionId, userId);
        if (!activeSession) {
            throw createError("유효한 로그인 세션이 아닙니다. 다시 로그인해주세요.", 401, "SESSION_INVALID");
        }
    }
    if (typeof browserFingerprint !== "string" || !browserFingerprint) {
        throw createError("요청 출처 정보가 없습니다.", 400);
    }

    const rawState = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);

    await userRepository.createOAuthState({
        state_hash: hashValue(rawState),
        purpose,
        user_id: purpose === "link" ? userId : null,
        session_id: purpose === "link" ? sessionId : null,
        browser_fingerprint_hash: hashValue(browserFingerprint),
        expires_at: expiresAt,
    });

    return { state: rawState, expiresAt };
};

const consumeOAuthStateTx = async (rawState, { browserFingerprint, purpose } = {}, transaction) => {
    if (typeof rawState !== "string" || !rawState) {
        throw createError("state가 없습니다.", 400, "STATE_MISSING");
    }
    if (typeof browserFingerprint !== "string" || !browserFingerprint) {
        throw createError("요청 출처 정보가 없습니다.", 400, "STATE_MISSING");
    }

    const stateHash = hashValue(rawState);
    const row = await userRepository.findOAuthStateByHash(stateHash, {
        transaction, lock: transaction.LOCK.UPDATE,
    });

    if (!row) {
        throw createError("유효하지 않은 state입니다.", 400, "STATE_INVALID");
    }
    if (row.consumed_at) {
        throw createError("이미 사용된 state입니다.", 409, "STATE_REUSED");
    }
    if (row.expires_at <= new Date()) {
        throw createError("만료된 state입니다. 다시 시도해주세요.", 400, "STATE_EXPIRED");
    }
    if (row.browser_fingerprint_hash !== hashValue(browserFingerprint)) {
        throw createError("요청 출처가 일치하지 않습니다.", 400, "STATE_FINGERPRINT_MISMATCH");
    }
    if (purpose && row.purpose !== purpose) {
        throw createError("state의 용도가 올바르지 않습니다.", 400, "STATE_PURPOSE_MISMATCH");
    }

    await userRepository.markOAuthStateConsumed(row.id, { transaction });

    return { purpose: row.purpose, userId: row.user_id, sessionId: row.session_id };
};

exports.consumeOAuthState = async (rawState, opts = {}) => {
    return await userRepository.withTransaction((transaction) => consumeOAuthStateTx(rawState, opts, transaction));
};

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
        const expiresAt = new Date(Date.now() + SOCIAL_SIGNUP_INTENT_TTL_MS);
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

exports.getSocialSignupIntent = async ({ intentToken } = {}) => {
    if (typeof intentToken !== "string" || !intentToken) {
        throw createError("가입 정보가 없습니다.", 400, "INTENT_INVALID");
    }

    const intent = await userRepository.findSocialSignupIntentByHash(hashValue(intentToken));
    if (!intent) {
        throw createError("가입 정보가 만료되었거나 존재하지 않습니다. 다시 로그인해주세요.", 400, "INTENT_INVALID");
    }
    if (intent.consumed_at) {
        throw createError("이미 처리된 가입 요청입니다.", 409, "INTENT_CONSUMED");
    }
    if (intent.expires_at <= new Date()) {
        throw createError("가입 가능 시간이 만료되었습니다. 다시 로그인해주세요.", 400, "INTENT_EXPIRED");
    }

    return { emailVerificationRequired: intent.email === null };
};

exports.handleOAuthCallback = async ({
    provider, subject, email, rawState, browserFingerprint, cancelled, rememberMe = false, reqInfo = {},
}) => {
    await exports.consumeOAuthState(rawState, { browserFingerprint, purpose: "login" });

    return await exports.resolveOAuthAccount({ provider, subject, email, cancelled, rememberMe, reqInfo });
};

exports.completeSocialSignup = async ({
    intentToken, nickname, birthDate, email, signupProof, rememberMe = false, reqInfo = {},
}) => {
    if (typeof intentToken !== "string" || !intentToken) {
        throw createError("가입 정보가 없습니다.", 400, "INTENT_INVALID");
    }
    const nicknameResult = validateNickname(nickname);
    if (!nicknameResult.ok) {
        throw createError(nicknameResult.message, 400);
    }
    const birthDateResult = validateBirthDate(birthDate);
    if (!birthDateResult.ok) {
        throw createError(birthDateResult.message, 400);
    }
    const birthDateValue = birthDateResult.value;

    return await userRepository.withTransaction(async (transaction) => {
        const intentHash = hashValue(intentToken);
        const intent = await userRepository.findSocialSignupIntentByHash(intentHash, {
            transaction, lock: transaction.LOCK.UPDATE,
        });
        if (!intent) {
            throw createError("가입 정보가 만료되었거나 존재하지 않습니다. 다시 로그인해주세요.", 400, "INTENT_INVALID");
        }
        if (intent.consumed_at) {
            throw createError("이미 처리된 가입 요청입니다.", 409, "INTENT_CONSUMED");
        }
        if (intent.expires_at <= new Date()) {
            throw createError("가입 가능 시간이 만료되었습니다. 다시 로그인해주세요.", 400, "INTENT_EXPIRED");
        }

        let accountEmail = intent.email;
        const emailSnapshot = intent.email;

        if (intent.email === null) {
            if (!validateEmailFormat(email)) {
                throw createError("이메일 형식이 올바르지 않습니다.", 400, "INVALID_INPUT");
            }
            const normalizedEmail = normalizeSignupEmail(email);

            if (typeof signupProof !== "string" || !signupProof) {
                throw createError("이메일 인증이 필요합니다.", 401, "SIGNUP_PROOF_REQUIRED");
            }

            const proofResult = await signupEmailVerificationService.consumeSignupProof(
                { email: normalizedEmail, signupProof }, { transaction },
            );
            if (!proofResult.ok) {
                throw createError("이메일 인증 증명이 유효하지 않습니다.", 401, "SIGNUP_PROOF_INVALID");
            }

            const existingByEmail = await userRepository.findByEmail(normalizedEmail, { transaction });
            if (existingByEmail) {
                throw createError(
                    "이미 가입된 이메일입니다. 기존 계정으로 로그인한 뒤 소셜 계정을 연결해주세요.",
                    409, "EMAIL_CONFLICT",
                );
            }

            accountEmail = normalizedEmail;
        }

        const existingNickname = await userRepository.findByNickname(nicknameResult.value);
        if (existingNickname) {
            throw createError("이미 사용 중인 닉네임입니다.", 409);
        }

        const randomSecret = generateOpaqueToken();
        const password_hash = await hashPassword(randomSecret);

        const user = await userRepository.createUser({
            email: accountEmail,
            password_hash,
            nickname: nicknameResult.value,
            birth_date: birthDateValue,
            email_verified: true,
            has_local_password: false,
        }, { transaction });
        await userRepository.createUserStats(user.uuid, { transaction });
        await userRepository.createExternalIdentity({
            provider: intent.provider,
            subject: intent.subject,
            user_id: user.uuid,
            email_snapshot: emailSnapshot,
        }, { transaction });
        await userRepository.markSocialSignupIntentConsumed(intent.id, { transaction });
        await economyService.ensureDefaultEntitlements(user.uuid, db, { transaction });

        const session = await authService.issueSessionForUser(user, { rememberMe: rememberMe === true }, reqInfo, transaction);
        return { user, ...session };
    });
};

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

exports.linkExternalIdentity = async ({ userId, sessionId, provider, subject, email, rawState, browserFingerprint }) => {
    if (!userId || !sessionId) {
        throw createError("로그인이 필요합니다.", 401);
    }

    const consumed = await exports.consumeOAuthState(rawState, { browserFingerprint, purpose: "link" });
    if (consumed.userId !== userId || consumed.sessionId !== sessionId) {
        throw createError("연결 요청 세션과 state 발급 세션이 일치하지 않습니다.", 400, "STATE_USER_MISMATCH");
    }

    return linkExternalIdentityForValidatedSession({ userId, sessionId, provider, subject, email });
};
