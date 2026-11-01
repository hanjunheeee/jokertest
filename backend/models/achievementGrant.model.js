// 업적 지급 표(achievement_grants) 모델, 받은 업적마다 한 줄 (같은 업적은 한 번만)
// models/index.js가 읽음, 업적 지급 저장소가 만들고 읽음
module.exports = (sequelize, DataTypes) => {
  const AchievementGrant = sequelize.define('AchievementGrant', {
    id: { type: DataTypes.BIGINT, primaryKey: true, allowNull: false, autoIncrement: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    // 업적 정의는 코드에 있고 여기엔 id만
    achievement_id: { type: DataTypes.STRING(60), allowNull: false },
    granted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'achievement_grants',
    timestamps: false,
    // 같은 사람·같은 업적 두 줄 막기 (동시 지급도 여기서 걸림)
    indexes: [
      { unique: true, fields: ['user_id', 'achievement_id'], name: 'achievement_grants_user_achievement_unique' },
    ],
  });

  AchievementGrant.associate = (models) => {
    AchievementGrant.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return AchievementGrant;
};
