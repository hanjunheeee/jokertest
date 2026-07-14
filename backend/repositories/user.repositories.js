const db     = require("../models");
const { Op } = db.Sequelize;

exports.findByEmail = async (email) => {
    return await db.User.findOne({ where: { email } });
};

exports.findByNickname = async (nickname) => {
    return await db.User.findOne({ where: { nickname } });
};

exports.findByUuid = async (uuid) => {
    return await db.User.findOne({ where: { uuid } });
};

exports.createUser = async (userData) => {
    return await db.User.create(userData);
};

exports.updateUser = async (uuid, updateData) => {
    return await db.User.update(updateData, { where: { uuid } });
};

exports.createUserStats = async (user_id) => {
    return await db.UserStats.create({ user_id });
};

exports.createLoginHistory = async (historyData) => {
    return await db.LoginHistory.create(historyData);
};

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

exports.createUserSession = async (sessionData) => {
    return await db.UserSession.create(sessionData);
};

exports.markOnlineSessionsOffline = async (user_id) => {
    return await db.UserSession.update(
        { is_online: false },
        { where: { user_id, is_online: true } }
    );
};

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
