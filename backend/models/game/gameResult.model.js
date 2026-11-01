// 판 결과 표(game_results) 모델, 끝난 판 하나에 한 줄 (참가자는 game_result_players)
// models/index.js가 읽음, 전적 저장소가 쓰고 읽음, 투표 참여 저장소가 끝난 판인지 붙여 봄
module.exports = (sequelize, DataTypes) => {
  const GameResult = sequelize.define('GameResult', {
    // 메모리 판 id 그대로 (같은 판 두 번 저장 막는 키)
    id: { type: DataTypes.UUID, primaryKey: true },
    room_id: { type: DataTypes.UUID, allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: false },
    ended_at: { type: DataTypes.DATE, allowNull: false },
    // 이긴 팀, 깨진 판은 NONE (이유는 ABORTED)
    winner: { type: DataTypes.STRING(20), allowNull: false },
    win_reason: { type: DataTypes.STRING(40), allowNull: true },
    // 끝난 날짜 번호
    day_index: { type: DataTypes.INTEGER, allowNull: false },
    player_count: { type: DataTypes.INTEGER, allowNull: false },
    // 판 설정 복사본 (조커 수·역할 구성·타이머·운영/시험 판 구분)
    settings: { type: DataTypes.JSON, allowNull: true },
    // false면 누가 나가서 깨진 판 (업적 보상·투표 업적은 끝난 판만 셈)
    completed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    tableName: 'game_results',
    timestamps: false,
  });

  GameResult.associate = (models) => {
    GameResult.hasMany(models.GameResultPlayer, { foreignKey: 'game_id', sourceKey: 'id' });
  };

  return GameResult;
};
