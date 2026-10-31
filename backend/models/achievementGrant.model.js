module.exports = (sequelize, DataTypes) => {
  const AchievementGrant = sequelize.define('AchievementGrant', {
    id: { type: DataTypes.BIGINT, primaryKey: true, allowNull: false, autoIncrement: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    achievement_id: { type: DataTypes.STRING(60), allowNull: false },
    granted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'achievement_grants',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['user_id', 'achievement_id'], name: 'achievement_grants_user_achievement_unique' },
    ],
  });

  AchievementGrant.associate = (models) => {
    AchievementGrant.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return AchievementGrant;
};
