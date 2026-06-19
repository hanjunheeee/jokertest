/**
 * 유저 게임 통계 Sequelize 모델 (1:1 with users).
 *
 * 게임 플레이 기록과 평판 시스템 데이터를 별도 테이블로 분리합니다.
 * users 테이블에 직접 넣지 않는 이유: 게임 통계는 업데이트 빈도가 높아 분리 관리합니다.
 */
module.exports = (sequelize, DataTypes) => {
  const UserStats = sequelize.define('UserStats', {
    user_id: {
      type:       DataTypes.UUID,
      primaryKey: true,
    },
    reputation: {
      type:         DataTypes.INTEGER,
      defaultValue: 0,
    },
    title: {
      type:         DataTypes.STRING(50),
      defaultValue: '신참',
    },
    total_games: {
      type:         DataTypes.INTEGER,
      defaultValue: 0,
    },
    survival_count: {
      type:         DataTypes.INTEGER,
      defaultValue: 0,
    },
    execution_count: {
      type:         DataTypes.INTEGER,
      defaultValue: 0,
    },
    most_played_role: {
      type:      DataTypes.STRING(50),
      allowNull: true,
    },
  }, {
    tableName:  'user_stats',
    timestamps: false,
  });

  UserStats.associate = (models) => {
    UserStats.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return UserStats;
};
