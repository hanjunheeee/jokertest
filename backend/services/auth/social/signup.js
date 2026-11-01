// 소셜 가입 파일, 가입 의도 확인 · 소셜 가입 마무리
// 이메일 없는 제공자면 이메일 인증 증명까지 받음
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
const { hashValue, generateOpaqueToken } = require('./tokens');

// 없음·처리됨·만료 확인, 이메일 인증 필요한지 알려 줌
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

// 닉네임·생일 검사 → (트랜잭션) 의도 잠금 → 이메일 증명 → 중복 → 계정·외부 계정·기본 지급 → 세션
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
