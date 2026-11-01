// 판 참가자 결과 표(game_result_players) 모델, 판 하나 × 참가자 한 사람에 한 줄
// models/index.js가 읽음, 전적 저장소가 판 저장 때 같이 쓰고 직업 통계·업적 진행 때 읽음
module.exports = (sequelize, DataTypes) => {
  const GameResultPlayer = sequelize.define('GameResultPlayer', {
    // 판 id + 사람 id 묶음이 키 (판 줄이 지워지면 같이 지워짐)
    game_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      references: { model: 'game_results', key: 'id' },
    },
    user_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      references: { model: 'users', key: 'uuid' },
    },
    // 그 판 때 닉네임 (나중에 닉네임 바꿔도 기록은 그대로)
    nickname_snapshot: { type: DataTypes.STRING(50), allowNull: false },
    role: { type: DataTypes.STRING(20), allowNull: false },
    team: { type: DataTypes.STRING(20), allowNull: false },
    // 깨진 판은 null (판 깨고 나간 사람만 false), 통계는 null 줄을 뺌
    won: { type: DataTypes.BOOLEAN, allowNull: true },
    is_alive: { type: DataTypes.BOOLEAN, allowNull: false },
    // EXECUTION·ASSASSINATION·DISCONNECT 등, 산 사람은 null
    death_reason: { type: DataTypes.STRING(20), allowNull: true },
  }, {
    tableName: 'game_result_players',
    timestamps: false,
  });

  GameResultPlayer.associate = (models) => {
    GameResultPlayer.belongsTo(models.GameResult, { foreignKey: 'game_id', targetKey: 'id' });
    GameResultPlayer.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return GameResultPlayer;
};
