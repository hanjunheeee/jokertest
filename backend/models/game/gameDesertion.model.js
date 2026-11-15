// 탈주 기록 표(game_desertions) 모델, 한 판 한 사람 한 줄 (이유·탈주 시각·막힘 끝 시각)
// models/index.js가 읽음, 탈주 기록 저장소가 쓰고 서버 켤 때·관리자 회원 상세가 읽음 (마이그레이션 0033)
module.exports = (sequelize, DataTypes) => {
  const GameDesertion = sequelize.define('GameDesertion', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'uuid' },
    },
    // 판 도중에 쓰니까 판 결과 표 외래 키는 없음
    game_id: { type: DataTypes.UUID, allowNull: false },
    // LEFT_ALIVE(산 채로 나감) · DISCONNECT_TIMEOUT(끊긴 뒤 60초 못 돌아옴)
    reason: { type: DataTypes.STRING(30), allowNull: false },
    deserted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    // 탈주 시각 + 대기 시간 (자정 지나도 남음)
    blocked_until: { type: DataTypes.DATE, allowNull: false },
  }, {
    tableName: 'game_desertions',
    timestamps: false,
    indexes: [
      // 같은 사람 같은 판은 한 줄만
      { unique: true, fields: ['user_id', 'game_id'], name: 'game_desertions_user_game_unique' },
      { fields: ['user_id', 'deserted_at'], name: 'game_desertions_user_deserted_idx' },
      { fields: ['blocked_until'], name: 'game_desertions_blocked_until_idx' },
    ],
  });

  GameDesertion.associate = (models) => {
    GameDesertion.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return GameDesertion;
};
