module.exports = (sequelize, DataTypes) => {
  const PasswordResetToken = sequelize.define('PasswordResetToken', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    // F-29b: 원문은 더 이상 저장하지 않는다 — token은 0015 이전에 만들어진 legacy 행에만
    // 남아 있고(그마저도 0015가 무효화한다), 신규 발급은 항상 token=NULL·token_hash만 쓴다.
    token: { type: DataTypes.STRING(255), allowNull: true },
    token_hash: { type: DataTypes.STRING(64), allowNull: true },
    expired_at: { type: DataTypes.DATE, allowNull: false },
    used: { type: DataTypes.BOOLEAN, defaultValue: false },
    // 성공적으로 소비된 토큰 자체에는 채우지 않는다(used=true로 충분) — 재설정 성공 이후
    // 폐기되는 "나머지" 미사용 토큰과 명시적으로 구분한다(F-29b AC-03).
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'password_reset_tokens',
    timestamps: false,
    // 0015-password-reset-tokens.js가 만드는 것과 같은 이름의 유일 인덱스를 모델에도
    // 선언한다 — 마이그레이션과 모델 정의가 서로 다른 인덱스 이름/대상을 가리키지 않게
    // 맞춘다(F-29b AC-06).
    indexes: [
      { name: 'password_reset_tokens_token_hash_unique', unique: true, fields: ['token_hash'] },
    ],
  });

  PasswordResetToken.associate = (models) => {
    PasswordResetToken.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return PasswordResetToken;
};
