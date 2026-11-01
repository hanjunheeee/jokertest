// 가입 파일, 이메일 가입 · 이메일 중복 확인
// controllers/auth/account.js가 account 입구로 부름
// 가입은 증명 소비·중복 확인·계정·통계·기본 지급을 한 트랜잭션에서 (하나라도 실패면 전부 되돌림)
const userRepository          = require("../../../repositories/user");
const { hashPassword } = require("../../../utils/auth/credentials");
const { createError }         = require("../../../utils/appError");
const { validateSignupPayload } = require("../../../validations/auth/signup");
const db                      = require("../../../repositories/common/db");
const economyService          = require("../../economy");
const signupEmailVerificationService = require("../signupEmailVerification");
const { normalizeEmail: normalizeSignupEmail } = require("../../../validations/auth/signupEmailVerification");

// 입력 검사 → 증명 있나 → 해시 → (트랜잭션) 증명 소비 → 이메일·닉네임 중복 → 만들기
exports.signup = async (userData) => {
    // 이메일·비번·닉네임·생일 모양 먼저 검사
    const parsed = validateSignupPayload(userData);
    if (!parsed.ok) {
        throw createError(parsed.message, parsed.status ?? 400);
    }
    const { email: normalizedEmail, password, nickname: normalizedNickname, birthDate } = parsed.value;

    // 이메일 인증 증명 없으면 해시 전에 거절
    const signupProof = userData?.signupProof;
    if (typeof signupProof !== "string" || !signupProof) {
        throw createError("이메일 인증이 필요합니다.", 401, "SIGNUP_PROOF_REQUIRED");
    }

    // bcrypt 해시는 느려서 트랜잭션 열기 전에 미리
    const password_hash = await hashPassword(password);

    return await userRepository.withTransaction(async (transaction) => {
        // 증명은 한 번만 쓰게 소비, 인증 행은 소문자 이메일로 찾음
        const proofResult = await signupEmailVerificationService.consumeSignupProof(
            { email: normalizeSignupEmail(normalizedEmail), signupProof },
            { transaction },
        );
        if (!proofResult.ok) {
            throw createError("이메일 인증 증명이 유효하지 않습니다.", 401, proofResult.code ?? "SIGNUP_PROOF_INVALID");
        }

        // 이메일·닉네임 중복이면 409 (던지면 증명 소비도 같이 되돌아감)
        const existingUser = await userRepository.findByEmail(normalizedEmail, { transaction });
        if (existingUser) {
            throw createError("이미 사용 중인 이메일입니다.", 409);
        }

        const existingNickname = await userRepository.findByNickname(normalizedNickname);
        if (existingNickname) {
            throw createError("이미 사용 중인 닉네임입니다.", 409);
        }

        // 여기부터 진짜 바뀜: 계정·통계·기본 지급 (인증 끝났으므로 email_verified true)
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
