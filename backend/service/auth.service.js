const userRepository          = require("../repositories/user.repositories");
const { hashPassword,
        comparePassword }     = require("../utils/hash");
const { generateToken }       = require("../utils/jwt");
const { createError }         = require("../utils/appError");
const { validateSignupPayload } = require("../validation/signupValidation");
const {
    PERSISTENT_SESSION_MAX_AGE_MS,
    ACCESS_TOKEN_SHORT_TTL_SECONDS,
    REFRESH_TOKEN_GRACE_MS,
} = require("../auth/cookieOptions");
const crypto                  = require("crypto");

// 갱신 자격 원문은 무작위 256비트 값이다. 서버는 이 값을 절대 저장하지 않고, 아래
// hashRefreshToken이 만든 sha256 해시만 DB에 남긴다(F-03 A-03).
const generateRefreshSecret = () => crypto.randomBytes(32).toString("base64url");
const hashRefreshToken      = (rawToken) => crypto.createHash("sha256").update(rawToken).digest("hex");

exports.signup = async (userData) => {
    // 닉네임 길이·문자셋, 비밀번호 길이, 비밀번호 확인 일치, 생년월일 유효성을 여기서
    // 모두 검사한다. value에는 허용한 필드(email/password/nickname/birthDate)만 담기므로
    // role·status·email_verified 같은 관리 필드가 요청에 섞여 있어도 저장 payload에 닿지 않는다.
    const parsed = validateSignupPayload(userData);
    if (!parsed.ok) {
        throw createError(parsed.message, parsed.status ?? 400);
    }
    const { email: normalizedEmail, password, nickname: normalizedNickname, birthDate } = parsed.value;

    const existingUser = await userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
        throw createError("이미 사용 중인 이메일입니다.", 409);
    }

    const existingNickname = await userRepository.findByNickname(normalizedNickname);
    if (existingNickname) {
        throw createError("이미 사용 중인 닉네임입니다.", 409);
    }

    const password_hash = await hashPassword(password);

    // users와 user_stats는 하나의 계정을 이루는 한 덩어리입니다. 예전처럼 순차 호출하면
    // createUserStats가 실패했을 때 통계 없는 반쪽 계정이 남아, 그 계정은 이후 프로필
    // 조회·집계에서 계속 결측으로 튀어나옵니다. 실패 시 둘 다 없던 일이 되게 묶습니다.
    // (해싱은 DB와 무관하고 느리므로 트랜잭션 밖에 둬서 커넥션 점유 시간을 늘리지 않습니다.)
    return await userRepository.withTransaction(async (transaction) => {
        const user = await userRepository.createUser({
            email: normalizedEmail,
            password_hash,
            nickname: normalizedNickname,
            birth_date: birthDate,
        }, { transaction });
        await userRepository.createUserStats(user.uuid, { transaction });
        return user;
    });
};

// 가입 최종 제출 이전, 입력 단계에서 이메일 중복을 미리 확인하기 위한 함수다. signup()의
// findByEmail 사전 검사와 같은 저장소 함수를 재사용하므로 두 단계가 같은 판정을 내린다 —
// 다만 이 함수가 available:true를 돌려준 뒤에도 다른 요청이 먼저 같은 이메일로 가입할 수
// 있으므로, 최종 저장은 여전히 signup()의 유일 제약(및 findByEmail 재검사)에 의존한다.
exports.checkEmailAvailability = async (email) => {
    if (typeof email !== "string" || !email.trim()) {
        throw createError("이메일을 입력해주세요.", 400);
    }
    const existing = await userRepository.findByEmail(email.trim());
    return { available: !existing };
};

exports.login = async (loginData, reqInfo) => {
    const { email, password, rememberMe } = loginData ?? {};

    if (!email?.trim() || !password) {
        throw createError("이메일과 비밀번호를 입력해주세요.", 400);
    }

    const user = await userRepository.findByEmail(email.trim());
    if (!user) {
        throw createError("가입되지 않은 이메일입니다.", 401);
    }

    if (user.locked_until && user.locked_until > new Date()) {
        throw createError("비밀번호 연속 오류로 계정이 잠겼습니다. 잠시 후 다시 시도해주세요.", 423);
    }

    const activeBan = await userRepository.checkActiveBan(user.uuid);
    if (activeBan) {
        throw createError(`정지된 계정입니다. 사유: ${activeBan.reason || "운영정책 위반"}`, 403);
    }

    const isMatch = await comparePassword(password, user.password_hash);

    await userRepository.createLoginHistory({
        user_id:    user.uuid,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        success:    isMatch,
    });

    if (!isMatch) {
        const failCount   = user.failed_login_count + 1;
        const lockedUntil = failCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

        await userRepository.updateUser(user.uuid, {
            failed_login_count: failCount,
            locked_until:       lockedUntil,
        });

        if (lockedUntil) {
            throw createError("비밀번호를 5회 잘못 입력하여 15분간 계정이 잠깁니다.", 423);
        }
        throw createError(`비밀번호가 일치하지 않습니다. (틀린 횟수: ${failCount}/5)`, 401);
    }

    await userRepository.updateUser(user.uuid, {
        failed_login_count: 0,
        locked_until:       null,
        last_login_at:      new Date(),
    });

    await userRepository.markOnlineSessionsOffline(user.uuid);

    const sessionId = crypto.randomUUID();

    // 로그인 유지를 선택했을 때만 회전형 갱신 자격을 발급한다. 미선택 세션은 갱신 수단
    // 자체가 없으므로 액세스 토큰이 만료되면(기존과 동일하게 1일) 재로그인이 필요하다(AC-02).
    let refreshToken = null;
    let refreshTokenHash = null;
    let refreshTokenExpiresAt = null;
    if (rememberMe === true) {
        refreshToken = generateRefreshSecret();
        refreshTokenHash = hashRefreshToken(refreshToken);
        refreshTokenExpiresAt = new Date(Date.now() + PERSISTENT_SESSION_MAX_AGE_MS);
    }

    await userRepository.createUserSession({
        id:                       sessionId,
        user_id:                  user.uuid,
        ip_address:               reqInfo.ip,
        is_online:                true,
        refresh_token_hash:       refreshTokenHash,
        refresh_token_expires_at: refreshTokenExpiresAt,
    });

    // 액세스 토큰은 로그인 유지 여부와 무관하게 짧게 산다. 로그인 유지의 30일 창은 위
    // refreshToken(서버에는 해시만 저장)이 절대 만료로 책임지고, 액세스 토큰은 그 창 안에서
    // 회전형 갱신(POST /auth/refresh)으로 계속 재발급된다 — 쿠키만 오래 살고 검증되지 않는
    // 상태를 피하기 위함이다(F-03 A-01).
    const token = generateToken({
        uuid:      user.uuid,
        role:      user.role,
        sessionId: sessionId,
    }, {
        expiresIn: rememberMe === true ? ACCESS_TOKEN_SHORT_TTL_SECONDS : "1d",
    });

    return { user, token, refreshToken };
};

// 액세스 토큰 만료 후 회전형 갱신 자격으로 새 액세스 토큰(및 새 갱신 자격)을 발급한다.
// 전체가 하나의 트랜잭션 안에서 행 잠금(FOR UPDATE)을 잡고 동작해, 동시에 들어온 두 회전
// 요청이 서로의 회전을 덮어쓰지 못하게 한다(F-03 A-03/A-08).
exports.refresh = async (rawRefreshToken) => {
    if (!rawRefreshToken) {
        throw createError("갱신 자격이 없습니다. 다시 로그인해주세요.", 401);
    }

    const presentedHash = hashRefreshToken(rawRefreshToken);

    return await userRepository.withTransaction(async (transaction) => {
        const session = await userRepository.findSessionForRefresh(presentedHash, { transaction });

        if (!session) {
            throw createError("유효하지 않은 갱신 자격입니다. 다시 로그인해주세요.", 401);
        }
        if (session.revoked_at) {
            throw createError("세션이 폐기되었습니다. 다시 로그인해주세요.", 401);
        }
        if (!session.refresh_token_expires_at || session.refresh_token_expires_at <= new Date()) {
            throw createError("로그인 유지 기간이 만료되었습니다. 다시 로그인해주세요.", 401);
        }

        const activeBan = await userRepository.checkActiveBan(session.user_id);
        if (activeBan) {
            throw createError(`정지된 계정입니다. 사유: ${activeBan.reason || "운영정책 위반"}`, 403);
        }

        const now = new Date();
        const isFreshMatch = session.refresh_token_hash === presentedHash;
        const isGraceMatch = !isFreshMatch
            && session.refresh_previous_hash === presentedHash
            && session.refresh_previous_expires_at
            && session.refresh_previous_expires_at > now;

        if (!isFreshMatch && !isGraceMatch) {
            // 이미 회전되어 무효화된 자격이 유예 기간 밖에서 다시 제시됐다 — 탈취로 의심해
            // 이 사용자의 모든 세션(모든 갱신 자격 포함)을 폐기한다(A-03/A-08 재사용 감지).
            await userRepository.markOnlineSessionsOffline(session.user_id, { transaction });
            throw createError("갱신 자격 재사용이 감지되어 모든 세션이 종료되었습니다. 다시 로그인해주세요.", 401);
        }

        const newRawRefreshToken = generateRefreshSecret();
        const newHash = hashRefreshToken(newRawRefreshToken);

        await userRepository.applyRefreshRotation(session.id, {
            newHash,
            previousHash: session.refresh_token_hash,
            previousExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_GRACE_MS),
        }, { transaction });

        const user = await userRepository.findByUuid(session.user_id);
        const accessToken = generateToken({
            uuid:      session.user_id,
            role:      user?.role,
            sessionId: session.id,
        }, { expiresIn: ACCESS_TOKEN_SHORT_TTL_SECONDS });

        return {
            accessToken,
            refreshToken: newRawRefreshToken,
        };
    });
};
