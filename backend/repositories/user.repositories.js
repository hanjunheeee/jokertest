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