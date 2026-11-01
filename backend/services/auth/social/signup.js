// 소셜 가입 파일, 가입 의도 확인 · 소셜 가입 마무리
// social 입구로 controllers/auth/socialSignup.js가 부름
// 제공자가 이메일 안 줬으면 이메일 인증 증명까지 받음
const userRepository = require("../../../repositories/user");
const authService = require("../account");
const { hashPassword } = require("../../../utils/auth/credentials");
const { createError } = require("../../../utils/appError");
const { validateNickname, validateBirthDate } = require("../../../validations/auth/signup");
const db = require("../../../repositories/common/db");
const economyService = require("../../economy");
const signupEmailVerificationService = require("../signupEmailVerification");
const {
    normalizeEmail: normalizeSignupEmail, validateEmailFormat,
} = require("../../../validations/auth/signupEmailVerification");
const { hashValue, generateOpaqueToken } = require('./tokens');

// 없음·처리됨·만료 확인, 이메일 인증 필요한지 알려 줌
exports.getSocialSignupIntent = async ({ intentToken } = {}) => {
    // 의도 토큰 없으면 DB 안 감
    if (typeof intentToken !== "string" || !intentToken) {
        throw createError("가입 정보가 없습니다.", 400, "INTENT_INVALID");
    }

    // DB엔 해시만 있어서 해시로 찾음, 없음·이미 씀·만료 거절
    const intent = await userRepository.findIntentByHash(hashValue(intentToken));
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
    // 의도 토큰·닉네임·생일 먼저 검사 (DB 안 감)
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
        // 의도 행 잠그고 다시 확인 (같은 의도로 두 번 가입 막기)
        const intentHash = hashValue(intentToken);
        const intent = await userRepository.findIntentByHash(intentHash, {
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

        // 계정 이메일은 제공자 이메일 먼저, 외부 계정 기록엔 제공자 값 그대로
        let accountEmail = intent.email;
        const emailSnapshot = intent.email;

        // 제공자 이메일 없으면 직접 넣은 이메일 + 인증 증명 받음
        if (intent.email === null) {
            if (!validateEmailFormat(email)) {
                throw createError("이메일 형식이 올바르지 않습니다.", 400, "INVALID_INPUT");
            }
            const normalizedEmail = normalizeSignupEmail(email);

            if (typeof signupProof !== "string" || !signupProof) {
                throw createError("이메일 인증이 필요합니다.", 401, "SIGNUP_PROOF_REQUIRED");
            }

            // 증명 한 번만 쓰게 소비 (가입 실패면 같이 되돌아감)
            const proofResult = await signupEmailVerificationService.consumeSignupProof(
                { email: normalizedEmail, signupProof }, { transaction },
            );
            if (!proofResult.ok) {
                throw createError("이메일 인증 증명이 유효하지 않습니다.", 401, "SIGNUP_PROOF_INVALID");
            }

            // 그 이메일로 이미 가입했으면 409 (로그인 뒤 연결하게)
            const existingByEmail = await userRepository.findByEmail(normalizedEmail, { transaction });
            if (existingByEmail) {
                throw createError(
                    "이미 가입된 이메일입니다. 기존 계정으로 로그인한 뒤 소셜 계정을 연결해주세요.",
                    409, "EMAIL_CONFLICT",
                );
            }

            accountEmail = normalizedEmail;
        }

        // 닉네임 중복 409
        const existingNickname = await userRepository.findByNickname(nicknameResult.value);
        if (existingNickname) {
            throw createError("이미 사용 중인 닉네임입니다.", 409);
        }

        // 로컬 비번 없는 계정이라 무작위 값 해시를 넣어 둠 (비번 로그인 못 하게)
        const randomSecret = generateOpaqueToken();
        const password_hash = await hashPassword(randomSecret);

        // 여기부터 진짜 바뀜: 계정·통계·외부 계정·의도 사용 표시·기본 지급
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
        await userRepository.markIntentConsumed(intent.id, { transaction });
        await economyService.ensureDefaultEntitlements(user.uuid, db, { transaction });

        // 같은 트랜잭션에서 세션 발급 (account 입구 객체로 불러 시험 패치 먹게)
        const session = await authService.issueSessionForUser(user, { rememberMe: rememberMe === true }, reqInfo, transaction);
        return { user, ...session };
    });
};
