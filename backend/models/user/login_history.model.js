module.exports = (sequelize, DataTypes) => {
  const LoginHistory = sequelize.define('LoginHistory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    ip_address: { type: DataTypes.STRING(45) },
    user_agent: { type: DataTypes.TEXT },
    device_type: { type: DataTypes.STRING(20) },
    login_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
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
