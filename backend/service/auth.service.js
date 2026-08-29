const userRepository          = require("../repositories/user.repositories");
const { hashPassword,
        comparePassword }     = require("../utils/hash");
const { generateToken }       = require("../utils/jwt");
const { createError }         = require("../utils/appError");
const crypto                  = require("crypto");

exports.signup = async (userData) => {
    const { email, password, nickname } = userData;

    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
        throw createError("이미 사용 중인 이메일입니다.", 409);
    }

    const existingNickname = await userRepository.findByNickname(nickname);
    if (existingNickname) {
        throw createError("이미 사용 중인 닉네임입니다.", 409);
    }

    const password_hash = await hashPassword(password);

    // users와 user_stats는 하나의 계정을 이루는 한 덩어리입니다. 예전처럼 순차 호출하면
    // createUserStats가 실패했을 때 통계 없는 반쪽 계정이 남아, 그 계정은 이후 프로필
    // 조회·집계에서 계속 결측으로 튀어나옵니다. 실패 시 둘 다 없던 일이 되게 묶습니다.
    // (해싱은 DB와 무관하고 느리므로 트랜잭션 밖에 둬서 커넥션 점유 시간을 늘리지 않습니다.)
    return await userRepository.withTransaction(async (transaction) => {
        const user = await userRepository.createUser({ email, password_hash, nickname }, { transaction });
        await userRepository.createUserStats(user.uuid, { transaction });
        return user;
    });
};

exports.login = async (loginData, reqInfo) => {
    const { email, password } = loginData;

    const user = await userRepository.findByEmail(email);
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
    await userRepository.createUserSession({
        id:         sessionId,
        user_id:    user.uuid,
        ip_address: reqInfo.ip,
        is_online:  true,
    });

    const token = generateToken({
        uuid:      user.uuid,
        role:      user.role,
        sessionId: sessionId,
    });

    return { user, token };
};
