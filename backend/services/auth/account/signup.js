// 가입 파일, 이메일 가입 · 이메일 중복 확인
// 가입은 증명 소비·중복 확인·계정·통계·기본 지급을 한 트랜잭션에서
const userRepository          = require("../../../repositories/user.repositories");
const { hashPassword } = require("../../../utils/hash");
const { createError }         = require("../../../utils/appError");
const { validateSignupPayload } = require("../../../validations/signupValidation");
const db                      = require("../../../models");
const economyService          = require("../../economy");
const signupEmailVerificationService = require("../signupEmailVerification");
const { normalizeEmail: normalizeSignupEmail } = require("../../../validations/signupEmailVerificationValidation");

// 입력 검사 → 증명 있나 → 해시 → (트랜잭션) 증명 소비 → 이메일·닉네임 중복 → 만들기
exports.signup = async (userData) => {
    const parsed = validateSignupPayload(userData);
    if (!parsed.ok) {
        throw createError(parsed.message, parsed.status ?? 400);
    }
    const { email: normalizedEmail, password, nickname: normalizedNickname, birthDate } = parsed.value;

    const signupProof = userData?.signupProof;
    if (typeof signupProof !== "string" || !signupProof) {
        throw createError("이메일 인증이 필요합니다.", 401, "SIGNUP_PROOF_REQUIRED");
    }

    const password_hash = await hashPassword(password);

    return await userRepository.withTransaction(async (transaction) => {
        const proofResult = await signupEmailVerificationService.consumeSignupProof(
            { email: normalizeSignupEmail(normalizedEmail), signupProof },
            { transaction },
        );
        if (!proofResult.ok) {
            throw createError("이메일 인증 증명이 유효하지 않습니다.", 401, proofResult.code ?? "SIGNUP_PROOF_INVALID");
        }

        const existingUser = await userRepository.findByEmail(normalizedEmail, { transaction });
        if (existingUser) {
            throw createError("이미 사용 중인 이메일입니다.", 409);
        }

        const existingNickname = await userRepository.findByNickname(normalizedNickname);
        if (existingNickname) {
            throw createError("이미 사용 중인 닉네임입니다.", 409);
        }

        const user = await userRepository.createUser({
            email: normalizedEmail,
            password_hash,
            nickname: normalizedNickname,
            birth_date: birthDate,
            email_verified: true,
        }, { transaction });
        await userRepository.createUserStats(user.uuid, { transaction });
        await economyService.ensureDefaultEntitlements(user.uuid, db, { transaction });
        return user;
    });
};

// 이메일 비었으면 400, 쓸 수 있으면 available true
exports.checkEmailAvailability = async (email) => {
    if (typeof email !== "string" || !email.trim()) {
        throw createError("이메일을 입력해주세요.", 400);
    }
    const existing = await userRepository.findByEmail(email.trim());
    return { available: !existing };
};
