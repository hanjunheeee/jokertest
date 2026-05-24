module.exports = (sequelize, DataTypes) => {
  const UserSession = sequelize.define('UserSession', {
    id: { type: DataTypes.STRING(255), primaryKey: true }, 
    user_id: { type: DataTypes.UUID, allowNull: false }, // 👈 여기도 추가!
    ip_address: { type: DataTypes.STRING(45) },
    connected_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    last_ping_at: { type: DataTypes.DATE },
    is_online: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'user_sessions',
    timestamps: false,
  });

  UserSession.associate = (models) => {
    UserSession.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return UserSession;
};