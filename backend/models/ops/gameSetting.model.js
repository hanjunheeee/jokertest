// 판 설정 값 표(game_settings) 모델, 값 이름 하나에 정수 한 줄 (처음 줄 GAME_GOLD_REWARD = 1)
// models/index.js가 읽음, 판 설정 값 서비스가 서버 켤 때·다시 읽기 때 읽고 관리자가 바꿈 (마이그레이션 0034)
module.exports = (sequelize, DataTypes) => {
  const GameSetting = sequelize.define('GameSetting', {
    key: { type: DataTypes.STRING(60), primaryKey: true },
    value_int: { type: DataTypes.INTEGER, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    // 바꾼 관리자 id (처음 줄은 빈 값)
    updated_by: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'game_settings',
    timestamps: false,
  });
  return GameSetting;
};
