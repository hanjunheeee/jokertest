module.exports = (sequelize, DataTypes) => {
  // F-05 AC-02/AC-03: 처음 보는 소셜 identity는 닉네임 등 필수 정보를 보완하기 전까지
  // users 행을 만들지 않는다(A-02). 이 행은 그 보완이 끝나기 전까지 "검증된 identity +
  // 만료형 자격"만 임시로 들고 있는다 — 원문 intent token은 저장하지 않고 sha256 해시만
  // 둔다(OAuthState와 같은 원칙). 가입 완료(completeSocialSignup) 시 이 행의 provider/
  // subject/email로 users + external_identities를 만들고 consumed_at을 채운다.
  const SocialSignupIntent = sequelize.define('SocialSignupIntent', {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    intent_token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    provider: { type: DataTypes.STRING(30), allowNull: false },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    email: { type: DataTypes.STRING(100), allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    consumed_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'social_signup_intents',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });

  return SocialSignupIntent;
};
