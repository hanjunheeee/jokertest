module.exports = (sequelize, DataTypes) => {
  const UserSession = sequelize.define('UserSession', {
    id: { type: DataTypes.STRING(255), primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    ip_address: { type: DataTypes.STRING(45) },
    connected_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    last_ping_at: { type: DataTypes.DATE },
    is_online: { type: DataTypes.BOOLEAN, defaultValue: true },
    refresh_token_hash: { type: DataTypes.STRING(64), allowNull: true },
    refresh_previous_hash: { type: DataTypes.STRING(64), allowNull: true },
    refresh_previous_expires_at: { type: DataTypes.DATE, allowNull: true },
    refresh_token_expires_at: { type: DataTypes.DATE, allowNull: true },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'user_sessions',
    timestamps: false,
  });

  UserSession.associate = (models) => {
    UserSession.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return UserSession;
};
