module.exports = (sequelize, DataTypes) => {
  const GameResultPlayer = sequelize.define('GameResultPlayer', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    game_result_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      // belongsTo도 같은 참조를 주입하지만, 관계 정의와 무관하게 DDL에 외래키가 남도록
      // 컬럼 쪽에도 명시합니다.
      references: { model: 'game_results', key: 'id' },
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      // users의 기본키는 uuid입니다(models/user/user.model.js). 다른 자식 테이블과 같은
      // 'UUID + NOT NULL + users.uuid 참조' 형태를 그대로 씁니다.
      references: { model: 'users', key: 'uuid' },
    },
    // 배정 역할 — JOKER/CITIZEN/DOCTOR/GUARD/WITCH_HUNTER (game-core/roleComposition.js)
    role: { type: DataTypes.STRING(20), allowNull: false },
    is_winner: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    survived: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'game_result_players',
    timestamps: false,
    indexes: [
      // 한 판에 같은 사용자가 두 번 기록되지 않도록 DB 레벨에서 막습니다.
      { unique: true, fields: ['game_result_id', 'user_id'] },
      // 특정 사용자의 전적을 모으는 조회 경로용입니다.
      { fields: ['user_id'] },
    ],
  });

  GameResultPlayer.associate = (models) => {
    GameResultPlayer.belongsTo(models.GameResult, { foreignKey: 'game_result_id', targetKey: 'id' });
    GameResultPlayer.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return GameResultPlayer;
};
