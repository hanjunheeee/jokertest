// 소셜 가입 대기 표(social_signup_intents) 모델, 처음 온 소셜 계정을 가입 폼까지 잠깐 들고 있음
// models/index.js가 읽음, 소셜 가입 의도 저장소가 만들기·찾기·처리 표시에 씀
module.exports = (sequelize, DataTypes) => {
  const SocialSignupIntent = sequelize.define('SocialSignupIntent', {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    // 브라우저에 준 토큰은 원문 없이 해시만
    intent_token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    provider: { type: DataTypes.STRING(30), allowNull: false },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    // 소셜 쪽이 확인한 이메일, null이면 가입 폼에서 이메일 인증을 따로 받음
    email: { type: DataTypes.STRING(100), allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    // 가입 끝나면 채움 (같은 토큰 두 번 가입 막기)
    consumed_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'social_signup_intents',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });

  return SocialSignupIntent;
};
