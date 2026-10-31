const userRepository          = require("../repositories/user.repositories");
const { hashPassword,
        comparePassword }     = require("../utils/hash");
const { generateToken }       = require("../utils/jwt");
const { createError }         = require("../utils/appError");
const { validateSignupPayload } = require("../validation/signupValidation");
const db                      = require("../models");
const economyService          = require("./economy.service");
const signupEmailVerificationService = require("./signupEmailVerification.service");
const { normalizeEmail: normalizeSignupEmail } = require("../validation/signupEmailVerificationValidation");
const {
    PERSISTENT_SESSION_MAX_AGE_MS,
    ACCESS_TOKEN_SHORT_TTL_SECONDS,
    REFRESH_TOKEN_GRACE_MS,
    capAccessTokenTtlSeconds,
} = require("../auth/cookieOptions");
const crypto                  = require("crypto");

const generateRefreshSecret = () => crypto.randomBytes(32).toString("base64url");
const hashRefreshToken      = (rawToken) => crypto.createHash("sha256").update(rawToken).digest("hex");

const deriveRotatedRefreshToken = (previousRawToken, sessionId) =>
    crypto.createHmac("sha256", process.env.JWT_SECRET)
        .update(`refresh-rotation-v1:${sessionId}:${previousRawToken}`)
        .digest("base64url");

exports.issueSessionForUser = async (user, { rememberMe = false } = {}, reqInfo = {}, transaction) => {
    await userRepository.markOnlineSessionsOffline(user.uuid, { transaction });

    const sessionId = crypto.randomUUID();
    const now = new Date();

    let refreshToken = null;
    let refreshTokenHash = null;
    let refreshTokenExpiresAt = null;
    if (rememberMe === true) {
        refreshToken = generateRefreshSecret();
        refreshTokenHash = hashRefreshToken(refreshToken);
        refreshTokenExpiresAt = new Date(now.getTime() + PERSISTENT_SESSION_MAX_AGE_MS);
    }

    await userRepository.createUserSession({
        id:                       sessionId,
        user_id:                  user.uuid,
        ip_address:               reqInfo.ip,
        is_online:                true,
        refresh_token_hash:       refreshTokenHash,
        refresh_token_expires_at: refreshTokenExpiresAt,
    }, { transaction });

    const token = generateToken({
        uuid:      user.uuid,
        role:      user.role,
        sessionId: sessionId,
    }, {
        expiresIn: rememberMe === true
            ? capAccessTokenTtlSeconds(ACCESS_TOKEN_SHORT_TTL_SECONDS, refreshTokenExpiresAt, now)
            : "1d",
    });

    return { token, refreshToken, refreshTokenExpiresAt };
};

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

    const outcome = await userRepository.withTransaction(async (transaction) => {
        const user = await userRepository.findByEmail(email.trim(), { transaction, lock: transaction.LOCK.UPDATE });
        if (!user) {
            throw createError("가입되지 않은 이메일입니다.", 401);
        }

        if (user.locked_until && user.locked_until > new Date()) {
            throw createError("비밀번호 연속 오류로 계정이 잠겼습니다. 잠시 후 다시 시도해주세요.", 423);
        }

        const activeBan = await userRepository.checkActiveBan(user.uuid);
        if (activeBan) {
            await userRepository.markOnlineSessionsOffline(user.uuid, { transaction });
            return { error: createError(`정지된 계정입니다. 사유: ${activeBan.reason || "운영정책 위반"}`, 403) };
        }

        const isMatch = await comparePassword(password, user.password_hash);

        await userRepository.createLoginHistory({
            user_id:    user.uuid,
            ip_address: reqInfo.ip,
            user_agent: reqInfo.userAgent,
            success:    isMatch,
        }, { transaction });

        if (!isMatch) {
            const failCount   = user.failed_login_count + 1;
            const lockedUntil = failCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

            await userRepository.updateUser(user.uuid, {
                failed_login_count: failCount,
                locked_until:       lockedUntil,
            }, { transaction });

            if (lockedUntil) {
                return { error: createError("비밀번호를 5회 잘못 입력하여 15분간 계정이 잠깁니다.", 423) };
            }
            return { error: createError(`비밀번호가 일치하지 않습니다. (틀린 횟수: ${failCount}/5)`, 401) };
        }

        await userRepository.updateUser(user.uuid, {
            failed_login_count: 0,
            locked_until:       null,
            last_login_at:      new Date(),
        }, { transaction });

        const { token, refreshToken, refreshTokenExpiresAt } =
            await exports.issueSessionForUser(user, { rememberMe }, reqInfo, transaction);

        return { value: { user, token, refreshToken, refreshTokenExpiresAt } };
    });
    if (outcome.error) throw outcome.error;
    return outcome.value;
};

exports.refresh = async (rawRefreshToken) => {
    if (!rawRefreshToken) {
        throw createError("갱신 자격이 없습니다. 다시 로그인해주세요.", 401);
    }

    const presentedHash = hashRefreshToken(rawRefreshToken);

    const outcome = await userRepository.withTransaction(async (transaction) => {
        const session = await userRepository.findSessionForRefresh(presentedHash, { transaction });

        if (!session) return { type: "invalid" };
        if (session.revoked_at) return { type: "revoked" };

        const now = new Date();
        if (!session.refresh_token_expires_at || session.refresh_token_expires_at <= now) {
            return { type: "expired" };
        }

        const activeBan = await userRepository.checkActiveBan(session.user_id);
        if (activeBan) {
            await userRepository.markOnlineSessionsOffline(session.user_id, { transaction });
            return { type: "banned", reason: activeBan.reason };
        }

        const isFreshMatch = session.refresh_token_hash === presentedHash;
        const isGraceMatch = !isFreshMatch
            && session.refresh_previous_hash === presentedHash
            && session.refresh_previous_expires_at
            && session.refresh_previous_expires_at > now;

        if (!isFreshMatch && !isGraceMatch) {
            await userRepository.markOnlineSessionsOffline(session.user_id, { transaction });
            return { type: "reuse" };
        }

        const cappedTtlSeconds = capAccessTokenTtlSeconds(ACCESS_TOKEN_SHORT_TTL_SECONDS, session.refresh_token_expires_at, now);
        if (cappedTtlSeconds <= 0) return { type: "expired" };

        const user = await userRepository.findByUuid(session.user_id);
        const accessToken = generateToken({
            uuid:      session.user_id,
            role:      user?.role,
            sessionId: session.id,
        }, { expiresIn: cappedTtlSeconds });

        if (isGraceMatch) {
            const recoveredRawRefreshToken = deriveRotatedRefreshToken(rawRefreshToken, session.id);
            return {
                type: "ok",
                accessToken,
                refreshToken: recoveredRawRefreshToken,
                refreshTokenExpiresAt: session.refresh_token_expires_at,
            };
        }

        const newRawRefreshToken = deriveRotatedRefreshToken(rawRefreshToken, session.id);
        const newHash = hashRefreshToken(newRawRefreshToken);

        await userRepository.applyRefreshRotation(session.id, {
            newHash,
            previousHash: session.refresh_token_hash,
            previousExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_GRACE_MS),
            evictedHash: session.refresh_previous_hash,
        }, { transaction });

        return {
            type: "ok",
            accessToken,
            refreshToken: newRawRefreshToken,
            refreshTokenExpiresAt: session.refresh_token_expires_at,
        };
    });

    switch (outcome.type) {
        case "invalid":
            throw createError("유효하지 않은 갱신 자격입니다. 다시 로그인해주세요.", 401);
        case "revoked":
            throw createError("세션이 폐기되었습니다. 다시 로그인해주세요.", 401);
        case "expired":
            throw createError("로그인 유지 기간이 만료되었습니다. 다시 로그인해주세요.", 401);
        case "banned":
            throw createError(`정지된 계정입니다. 사유: ${outcome.reason || "운영정책 위반"}`, 403);
        case "reuse":
            throw createError("갱신 자격 재사용이 감지되어 모든 세션이 종료되었습니다. 다시 로그인해주세요.", 401);
        default:
            return {
                accessToken: outcome.accessToken,
                refreshToken: outcome.refreshToken,
                refreshTokenExpiresAt: outcome.refreshTokenExpiresAt,
            };
    }
};
