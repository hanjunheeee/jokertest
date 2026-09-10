// F-12 업적 지급 이력. (user_id, achievement_id) 복합 유일 인덱스가 동시 달성·중복
// 요청·재시도·소급 재평가에서도 같은 업적이 두 번 지급되지 않는 근거다(AC-04) — 컬럼
// 정의는 backend/db/migrations/0009-add-achievement-grants.js와 항상 같은 모양이어야
// 한다. achievement_id는 achievementDefinitions.js가 정의하는 프론트 원본 id 문자열이다.
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
