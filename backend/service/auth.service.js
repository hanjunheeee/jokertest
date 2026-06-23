/**
 * @file auth.service.js
 * @desc 회원가입 · 로그인 비즈니스 로직 서비스
 */

const userRepository          = require("../repositories/user.repositories");
const { hashPassword,
        comparePassword }     = require("../utils/hash");
const { generateToken }       = require("../utils/jwt");
const { createError }         = require("../utils/appError");
const crypto                  = require("crypto");

/**
 * 신규 유저를 등록합니다.
 * @param {Object} userData
 * @param {string} userData.email
 * @param {string} userData.password
 * @param {string} userData.nickname
 * @returns {Promise<Object>} 생성된 User 인스턴스
 * @throws {Error} 이미 사용 중인 이메일
 */
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
    const user = await userRepository.createUser({ email, password_hash, nickname });
    // 게임 통계 초기 레코드 — 신규 유저는 항상 0으로 시작
    await userRepository.createUserStats(user.uuid);
    return user;
};

/**
 * 이메일/비밀번호로 로그인합니다.
 * 실패 횟수 5회 초과 시 15분 잠금, 활성 Ban 내역 존재 시 로그인 거부.
 * @param {Object} loginData
 * @param {string} loginData.email
 * @param {string} loginData.password
 * @param {Object} reqInfo
 * @param {string} reqInfo.ip
 * @param {string} reqInfo.userAgent
 * @param {string} reqInfo.deviceType
 * @returns {Promise<{ user: Object, token: string }>}
 * @throws {Error} 유저 없음 / 계정 잠금 / 계정 정지 / 비밀번호 불일치
 */
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
        // 5회 이상 실패 시 15분 잠금
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
