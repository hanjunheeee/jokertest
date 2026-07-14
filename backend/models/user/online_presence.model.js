module.exports = (sequelize, DataTypes) => {
  const OnlinePresence = sequelize.define('OnlinePresence', {
    user_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    status: { type: DataTypes.STRING(20), defaultValue: 'ONLINE' },
    last_active_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    current_room_id: { type: DataTypes.INTEGER },
  }, {
    tableName: 'online_presence',
    timestamps: false,
  });

  OnlinePresence.associate = (models) => {
    OnlinePresence.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return OnlinePresence;
};
