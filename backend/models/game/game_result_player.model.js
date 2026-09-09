module.exports = (sequelize, DataTypes) => {
  const GameResultPlayer = sequelize.define('GameResultPlayer', {
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
    // F-01: users.nickname과 동일하게 50자까지 담는다(0002-expand-nickname-snapshot.js가
    // 기존 DB의 실제 컬럼을 30→50으로 확장한다). 여기서 모델 정의만 앞서가면 새로 sync()된
    // DB와 마이그레이션으로 만든 DB의 최종 상태가 어긋나므로, 두 경로 모두 50을 목표로 한다.
    nickname_snapshot: { type: DataTypes.STRING(50), allowNull: false },
    role: { type: DataTypes.STRING(20), allowNull: false },
    team: { type: DataTypes.STRING(20), allowNull: false },
    won: { type: DataTypes.BOOLEAN, allowNull: true },
    is_alive: { type: DataTypes.BOOLEAN, allowNull: false },
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
