// 낮 투표 참여 표(vote_participations) 모델, 판·날짜·사람마다 투표했다는 표시 한 줄 (누구 찍었는지는 없음)
// models/index.js가 읽음, 투표 참여 저장소가 쓰고 업적 진행 때 셈
module.exports = (sequelize, DataTypes) => {
  const VoteParticipation = sequelize.define('VoteParticipation', {
    id: { type: DataTypes.BIGINT, primaryKey: true, allowNull: false, autoIncrement: true },
    // 판이 아직 진행 중일 때 쓰니까 판 결과 표 외래 키는 없음
    game_id: { type: DataTypes.UUID, allowNull: false },
    day_index: { type: DataTypes.INTEGER, allowNull: false },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'uuid' },
    },
    accepted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'vote_participations',
    timestamps: false,
    // 같은 판·같은 날·같은 사람은 한 번만 셈
    indexes: [
      { unique: true, fields: ['game_id', 'day_index', 'user_id'], name: 'vote_participations_game_day_user_unique' },
    ],
  });

  // 판 결과 표와는 제약 없이 이름만 이음 (셀 때 끝난 판만 붙여 보려고)
  VoteParticipation.associate = (models) => {
    VoteParticipation.belongsTo(models.GameResult, { foreignKey: 'game_id', targetKey: 'id', constraints: false });
    VoteParticipation.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return VoteParticipation;
};
