// 로그인 기록 표(login_history) 모델, 로그인 시도마다 한 줄 + 로그아웃 시각
// models/index.js가 읽음, 로그인 보호·세션 저장소가 씀
module.exports = (sequelize, DataTypes) => {
  const LoginHistory = sequelize.define('LoginHistory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    ip_address: { type: DataTypes.STRING(45) },
    user_agent: { type: DataTypes.TEXT },
    // PC·MOBILE·TABLET·UNKNOWN (utils/request.js가 고름)
    device_type: { type: DataTypes.STRING(20) },
    login_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    // 로그아웃하면 마지막 성공 로그인 줄에 채움
    logout_at: { type: DataTypes.DATE },
    success: { type: DataTypes.BOOLEAN, allowNull: false },
  }, {
    tableName: 'login_history',
    timestamps: false,
  });

  LoginHistory.associate = (models) => {
    LoginHistory.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return LoginHistory;
};
