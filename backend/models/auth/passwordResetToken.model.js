// 비밀번호 재설정 토큰 표(password_reset_tokens) 모델, 재설정 메일 한 통에 한 줄
// models/index.js가 읽음, 비밀번호 재설정 토큰 저장소가 씀
module.exports = (sequelize, DataTypes) => {
  const PasswordResetToken = sequelize.define('PasswordResetToken', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    // 옛 원문 토큰 칸, 새로 만들 땐 안 채움 (해시만 남김)
    token: { type: DataTypes.STRING(255), allowNull: true },
    token_hash: { type: DataTypes.STRING(64), allowNull: true },
    expired_at: { type: DataTypes.DATE, allowNull: false },
    // 썼거나 폐기됐으면 true, 새 메일 보내면 옛 토큰은 전부 폐기
    used: { type: DataTypes.BOOLEAN, defaultValue: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'password_reset_tokens',
    timestamps: false,
    indexes: [
      { name: 'password_reset_tokens_token_hash_unique', unique: true, fields: ['token_hash'] },
    ],
  });

  PasswordResetToken.associate = (models) => {
    PasswordResetToken.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return PasswordResetToken;
};
