module.exports = (sequelize, DataTypes) => {
  // F-11: 경기·(일반 낮) 라운드·참여자 단위로 유효 투표 참여 사건 하나를 저장한다. 세
  // 집계 키(game_id, day_index, user_id)는 아래 유일 인덱스가 지키고, 이게 곧 AC-02(중복
  // 제출·재시도 dedup)와 A-02(재투표 차수는 키에 없음)의 DB 근거다.
  //
  // game_id는 game_results.id를 참조하지 않는다(의도적) — 사건은 경기가 진행 중일 때(그
  // 라운드가 끝나는 즉시) 저장되므로, 저장 시점에는 아직 game_results 행이 없다. 집계
  // 시점(voteParticipation.repositories.js의 countEligibleDayVoteParticipations)에서만
  // game_results와 JOIN해 완료·출처를 판정한다(A-04).
  const VoteParticipation = sequelize.define('VoteParticipation', {
    id: { type: DataTypes.BIGINT, primaryKey: true, allowNull: false, autoIncrement: true },
    game_id: { type: DataTypes.UUID, allowNull: false },
    // "일반 낮 라운드" 식별자 = session.dayIndex다(재투표 차수인 dayVoteRound가 아니다).
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
    indexes: [
      { unique: true, fields: ['game_id', 'day_index', 'user_id'], name: 'vote_participations_game_day_user_unique' },
    ],
  });

  VoteParticipation.associate = (models) => {
    // game_results FK는 걸지 않는다(위 주석 참고) — constraints:false로 JOIN 계약만 선언한다.
    VoteParticipation.belongsTo(models.GameResult, { foreignKey: 'game_id', targetKey: 'id', constraints: false });
    VoteParticipation.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return VoteParticipation;
};
