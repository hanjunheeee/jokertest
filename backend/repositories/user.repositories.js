const db = require("../models");
const { Op } = db.Sequelize;

exports.findByEmailOrLoginId = async (email, login_id) => {
  return await db.User.findOne({
    where: {
      [Op.or]: [{ email }, { login_id }],
    },
  });
};

exports.findByEmail = async (email) => {
  return await db.User.findOne({ where: { email } });
};

exports.createUser = async (userData) => {
  return await db.User.create(userData);
};

exports.createLoginHistory = async (historyData) => {
  return await db.LoginHistory.create(historyData);
};

exports.updateUser = async (uuid, updateData) => {
  return await db.User.update(updateData, { where: { uuid } });
}

exports.checkActiveBan = async (user_id) => {
  return await db.UserBan.findOne({
    where: {
      user_id,
      [Op.or]: [
        { is_permanent: true }, 
        { end_at: { [Op.gt]: new Date()}} 
      ]
    }
  });
};

exports.createUserSession = async (sessionData) => {
  return await db.UserSession.create(sessionData);
}