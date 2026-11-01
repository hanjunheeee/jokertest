// 계정 통계 표(user_stats) 모델, 판 수·생존·처형·많이 한 직업 (계정마다 한 줄)
// models/index.js가 읽음, 가입 때 만들고 전적 저장이 더함, 프로필 저장소가 읽음
module.exports = (sequelize, DataTypes) => {
  const UserStats = sequelize.define('UserStats', {
    // 계정 uuid가 그대로 키 (계정당 한 줄)
    user_id: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    // 평판·칭호는 값을 바꾸는 곳 없음 (칭호는 늘 기본값)
    reputation: { type: DataTypes.INTEGER, defaultValue: 0 },
    title: { type: DataTypes.STRING(50), defaultValue: '신참' },
    // 승패 정해진 판만 더함 (깨진 판은 안 셈)
    total_games: { type: DataTypes.INTEGER, defaultValue: 0 },
    survival_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    execution_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    // 전적 저장 때마다 그 사람 기록으로 다시 셈
    most_played_role: { type: DataTypes.STRING(50), allowNull: true },
  }, {
    tableName: 'user_stats',
    timestamps: false,
  });

  UserStats.associate = (models) => {
    UserStats.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return UserStats;
};
