/**
 * @file user.repositories.js
 * @desc 유저 · 로그인 이력 · 계정 제재 · 세션 DB 접근 레포지토리
 */

const db     = require("../models");
const { Op } = db.Sequelize;

/**
 * 이메일로 유저를 조회합니다.
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
exports.findByEmail = async (email) => {
    return await db.User.findOne({ where: { email } });
};

/**
 * 신규 유저를 생성합니다.
 * @param {Object} userData - { email, password_hash, nickname }
 * @returns {Promise<Object>}
 */
exports.createUser = async (userData) => {
    return await db.User.create(userData);
};

/**
 * 유저 정보를 업데이트합니다.
 * @param {string} uuid
 * @param {Object} updateData
 * @returns {Promise<Array>}
 */
exports.updateUser = async (uuid, updateData) => {
    return await db.User.update(updateData, { where: { uuid } });
};

/**
 * 로그인 시도 이력을 기록합니다.
 * @param {Object} historyData - { user_id, ip_address, user_agent, device_type, success }
 * @returns {Promise<Object>}
 */
exports.createLoginHistory = async (historyData) => {
    return await db.LoginHistory.create(historyData);
};

/**
 * 활성화된 계정 정지 내역이 있는지 확인합니다.
 * 영구 정지(is_permanent) 또는 기간 정지(end_at > 현재)이면 객체를 반환합니다.
 * @param {string} user_id
 * @returns {Promise<Object|null>}
 */
exports.checkActiveBan = async (user_id) => {
    return await db.UserBan.findOne({
        where: {
            user_id,
            [Op.or]: [
                { is_permanent: true },
                { end_at: { [Op.gt]: new Date() } },
            ],
        },
    });
};

/**
 * 새 유저 세션을 생성합니다.
 * @param {Object} sessionData - { id, user_id, ip_address, is_online }
 * @returns {Promise<Object>}
 */
exports.createUserSession = async (sessionData) => {
    return await db.UserSession.create(sessionData);
};
