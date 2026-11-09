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
const bannedWords = require("../../ops/bannedWords");
// 약관 동의·만 14세 확인 (입구 객체로 불러 시험 갈아끼우기 먹게)
const termsService = require("../terms");
const signupEmailVerificationService = require("../signupEmailVerification");
const {
    normalizeEmail: normalizeSignupEmail, validateEmailFormat,
} = require("../../../validations/auth/signupEmailVerification");
const { hashValue, generateOpaqueToken } = require('./tokens');

// 의도 행이 없음·이미 씀·만료면 거절
const assertIntentUsable = (intent) => {
    if (!intent) {
        throw createError("가입 정보가 만료되었거나 존재하지 않습니다. 다시 로그인해주세요.", 400, "INTENT_INVALID");
    }
    if (intent.consumed_at) {
        throw createError("이미 처리된 가입 요청입니다.", 409, "INTENT_CONSUMED");
    }
    if (intent.expires_at <= new Date()) {
        throw createError("가입 가능 시간이 만료되었습니다. 다시 로그인해주세요.", 400, "INTENT_EXPIRED");
    }
};

const emailConflictError = () => createError(
    "이미 가입된 이메일입니다. 기존 계정으로 로그인한 뒤 소셜 계정을 연결해주세요.",
    409, "EMAIL_CONFLICT",
);

// 없음·처리됨·만료 확인, 이메일 인증 필요한지 알려 줌
exports.getSocialSignupIntent = async ({ intentToken } = {}) => {
    // 의도 토큰 없으면 DB 안 감
    if (typeof intentToken !== "string" || !intentToken) {
        throw createError("가입 정보가 없습니다.", 400, "INTENT_INVALID");
    }

    // DB엔 해시만 있어서 해시로 찾음
    const intent = await userRepository.findIntentByHash(hashValue(intentToken));
    assertIntentUsable(intent);

    return { emailVerificationRequired: intent.email === null };
};

// 의도 토큰·닉네임(금지어 포함)·생일 검사 (DB 안 감), 다듬은 닉네임·생일 돌려줌
const validateSignupProfile = ({ intentToken, nickname, birthDate }) => {
    if (typeof intentToken !== "string" || !intentToken) {
        throw createError("가입 정보가 없습니다.", 400, "INTENT_INVALID");
    }
    const nicknameResult = validateNickname(nickname);
    if (!nicknameResult.ok) {
        throw createError(nicknameResult.message, 400);
    }
    // 금지어 표 비면 안 막음
    if (bannedWords.containsBannedWord(nicknameResult.value)) {
        throw createError("사용할 수 없는 단어가 들어간 닉네임입니다.", 400, "NICKNAME_BANNED_WORD");
    }
    const birthDateResult = validateBirthDate(birthDate);
    if (!birthDateResult.ok) {
        throw createError(birthDateResult.message, 400);
    }
    return { nicknameValue: nicknameResult.value, birthDateValue: birthDateResult.value };
};

// 계정 이메일 정하기: 제공자 이메일 먼저, 없으면 직접 넣은 이메일 + 인증 증명
const resolveAccountEmail = async (intent, { email, signupProof }, transaction) => {
    // 제공자 이메일이면 의도 만든 뒤 그 이메일로 가입한 계정이 생겼는지 다시 봄 (일반 409 대신 EMAIL_CONFLICT)
    if (intent.email !== null) {
        if (await userRepository.findByEmail(intent.email, { transaction })) throw emailConflictError();
        return intent.email;
    }

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
    if (await userRepository.findByEmail(normalizedEmail, { transaction })) throw emailConflictError();
    return normalizedEmail;
};

// 계정·통계·외부 계정·의도 사용 표시·기본 지급·동의 기록·로그인 기록 (한 트랜잭션)
const createSocialAccount = async ({ intent, accountEmail, nicknameValue, birthDateValue, agreedVersionIds, reqInfo }, transaction) => {
    // 로컬 비번 없는 계정이라 무작위 값 해시를 넣어 둠 (비번 로그인 못 하게)
    const randomSecret = generateOpaqueToken();
    const password_hash = await hashPassword(randomSecret);

    const user = await userRepository.createUser({
        email: accountEmail,
        password_hash,
        nickname: nicknameValue,
        birth_date: birthDateValue,
        email_verified: true,
        has_local_password: false,
    }, { transaction });
    await userRepository.createUserStats(user.uuid, { transaction });
    // 외부 계정 기록엔 제공자 값 그대로
    await userRepository.createExternalIdentity({
        provider: intent.provider,
        subject: intent.subject,
        user_id: user.uuid,
        email_snapshot: intent.email,
    }, { transaction });
    await userRepository.markIntentConsumed(intent.id, { transaction });
    await economyService.ensureDefaultEntitlements(user.uuid, db, { transaction });
    await termsService.recordAgreements(user.uuid, agreedVersionIds, { transaction });
    // 가입 마무리도 로그인이라 기록·마지막 접속 시각 남김 (로그아웃이 이 기록을 닫음)
    await userRepository.updateUser(user.uuid, { last_login_at: new Date() }, { transaction });
    await userRepository.createLoginHistory({
        user_id:    user.uuid,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        device_type: reqInfo.deviceType,
        success:    true,
    }, { transaction });
    return user;
};

// 닉네임·생일·약관·만 14세 검사 → (트랜잭션) 의도 잠금 → 이메일 증명 → 중복 → 계정·외부 계정·기본 지급·동의 기록 → 세션
exports.completeSocialSignup = async ({
    intentToken, nickname, birthDate, email, signupProof, agreedTermsVersionIds, ageConfirmed,
    rememberMe = false, reqInfo = {},
}) => {
    const { nicknameValue, birthDateValue } = validateSignupProfile({ intentToken, nickname, birthDate });
    // 만 14세 확인 체크·생일 14세 미만·필수 약관 빠짐이면 트랜잭션 전에 거절
    const agreedVersionIds = await termsService.checkSignupAgreements({
        agreedTermsVersionIds, ageConfirmed, birthDate: birthDateValue,
    });

    return await userRepository.withTransaction(async (transaction) => {
        // 의도 행 잠그고 다시 확인 (같은 의도로 두 번 가입 막기)
        const intent = await userRepository.findIntentByHash(hashValue(intentToken), {
            transaction, lock: transaction.LOCK.UPDATE,
        });
        assertIntentUsable(intent);

        const accountEmail = await resolveAccountEmail(intent, { email, signupProof }, transaction);

        // 닉네임 중복 409
        if (await userRepository.findByNickname(nicknameValue, { transaction })) {
            throw createError("이미 사용 중인 닉네임입니다.", 409);
        }

        // 여기부터 진짜 바뀜
        const user = await createSocialAccount({
            intent, accountEmail, nicknameValue, birthDateValue, agreedVersionIds, reqInfo,
        }, transaction);

        // 같은 트랜잭션에서 세션 발급 (account 입구 객체로 불러 시험 패치 먹게)
        const session = await authService.issueSessionForUser(user, { rememberMe: rememberMe === true }, reqInfo, transaction);
        return { user, ...session };
    });
};
