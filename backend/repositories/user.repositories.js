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
 * 닉네임으로 유저를 조회합니다.
 * @param {string} nickname
 * @returns {Promise<Object|null>}
 */
exports.findByNickname = async (nickname) => {
    return await db.User.findOne({ where: { nickname } });
};

/**
 * UUID로 유저를 조회합니다.
 * @param {string} uuid
 * @returns {Promise<Object|null>}
 */
exports.findByUuid = async (uuid) => {
    return await db.User.findOne({ where: { uuid } });
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

/**
 * 특정 유저의 기존 온라인 세션을 모두 오프라인 처리합니다.
 * 로그인 성공 시 단일 활성 세션 정책을 맞추기 위해 새 세션 생성 전에 호출합니다.
 * @param {string} user_id
 * @returns {Promise<Array>}
 */
exports.markOnlineSessionsOffline = async (user_id) => {
    return await db.UserSession.update(
        { is_online: false },
        { where: { user_id, is_online: true } }
    );
};

/**
 * 회원가입 시 user_stats 초기 레코드를 생성합니다.
 * @param {string} user_id
 */
exports.createUserStats = async (user_id) => {
    return await db.UserStats.create({ user_id });
};

/**
 * 마이페이지에 필요한 프로필 + 게임 통계를 한 번에 조회합니다.
 * @param {string} uuid
 * @returns {Promise<Object>}
 */
exports.getMyProfile = async (uuid) => {
    return await db.User.findOne({
        where: { uuid },
        attributes: ['nickname', 'profile_image_url'],
        include: [{
            model:      db.UserStats,
            attributes: ['reputation', 'title', 'total_games', 'survival_count', 'execution_count', 'most_played_role'],
        }],
    });
};

/**
 * 로그아웃(명시적 또는 브라우저 종료) 시점을 DB에 기록합니다.
 *  - login_history: logout_at 미기록 상태인 가장 최근 성공 이력에 현재 시각을 기록합니다.
 *  - user_sessions: 해당 유저의 활성 세션을 모두 is_online=false로 처리합니다.
 * @param {string} user_id
 */
exports.recordLogout = async (user_id) => {
    const lastLogin = await db.LoginHistory.findOne({
        where: { user_id, success: true, logout_at: null },
        order: [['login_at', 'DESC']],
    });
    if (lastLogin) {
        await lastLogin.update({ logout_at: new Date() });
    }
    await db.UserSession.update(
        { is_online: false },
        { where: { user_id, is_online: true } }
    );
};
