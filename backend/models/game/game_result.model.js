module.exports = (sequelize, DataTypes) => {
  const GameResult = sequelize.define('GameResult', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // 방 코드는 utils/roomCode.js가 만드는 6자리 문자열이다. 방은 게임이 끝나면 사라지므로
    // 방 테이블을 참조하지 않고 종료 시점의 코드를 그대로 남긴다.
    room_code: { type: DataTypes.STRING(10), allowNull: false },
    // 'JOKER' 또는 'CITIZEN' — game-core의 evaluateWinCondition이 내는 winResult.winner 값.
    winner_team: { type: DataTypes.STRING(20), allowNull: false },
    player_count: { type: DataTypes.INTEGER, allowNull: false },
    total_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    started_at: { type: DataTypes.DATE, allowNull: false },
    ended_at: { type: DataTypes.DATE, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'game_results',
    // 한 번 쓰고 갱신하지 않는 기록이라 updated_at을 두지 않고 created_at만 직접 선언합니다.
    timestamps: false,
    indexes: [
      // 최근 전적 조회가 종료 시각 역순이라 ended_at에 인덱스를 둡니다.
      { fields: ['ended_at'] },
    ],
  });

  GameResult.associate = (models) => {
    GameResult.hasMany(models.GameResultPlayer, { foreignKey: 'game_result_id', sourceKey: 'id' });
  };

  return GameResult;
};
