/**
 * @file auth.service.js
 * @desc 회원가입 · 로그인 비즈니스 로직 서비스
 */

const userRepository          = require("../repositories/user.repositories");
const { hashPassword,
        comparePassword }     = require("../utils/hash");
const { generateToken }       = require("../utils/jwt");
const crypto                  = require("crypto");
const db                      = require("../models");

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
        throw new Error("이미 사용 중인 이메일입니다.");
    }

    const password_hash = await hashPassword(password);
    return await userRepository.createUser({ email, password_hash, nickname });
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
        throw new Error("가입되지 않은 이메일입니다.");
    }

    if (user.locked_until && user.locked_until > new Date()) {
        throw new Error("비밀번호 연속 오류로 계정이 잠겼습니다. 잠시 후 다시 시도해주세요.");
    }

    const activeBan = await userRepository.checkActiveBan(user.uuid);
    if (activeBan) {
        throw new Error(`정지된 계정입니다. 사유: ${activeBan.reason || "운영정책 위반"}`);
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
            throw new Error("비밀번호를 5회 잘못 입력하여 15분간 계정이 잠깁니다.");
        }
        throw new Error(`비밀번호가 일치하지 않습니다. (틀린 횟수: ${failCount}/5)`);
    }

    await userRepository.updateUser(user.uuid, {
        failed_login_count: 0,
        locked_until:       null,
        last_login_at:      new Date(),
    });

    await db.UserSession.update(
        { is_online: false },
        { where: { user_id: user.uuid, is_online: true } }
    );

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
