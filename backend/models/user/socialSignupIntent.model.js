module.exports = (sequelize, DataTypes) => {
  // F-05 AC-02/AC-03: 처음 보는 소셜 identity는 닉네임 등 필수 정보를 보완하기 전까지
  // users 행을 만들지 않는다(A-02). 이 행은 그 보완이 끝나기 전까지 "검증된 identity +
  // 만료형 자격"만 임시로 들고 있는다 — 원문 intent token은 저장하지 않고 sha256 해시만
  // 둔다(OAuthState와 같은 원칙). 가입 완료(completeSocialSignup) 시 이 행의 provider/
  // subject/email로 users + external_identities를 만들고 consumed_at을 채운다.
  //
  // F-31 AC-02: email은 "제공자가 서버 검증까지 마쳐 내려준 이메일"만 담는다 — Google
  // email_verified/Discord verified가 boolean true가 아니거나 이메일 자체가 없으면
  // (googleOAuth.service.js/discordOAuth.service.js가 null을 반환한다) 이 컬럼은 null로
  // 남고, 그 상태가 곧 "자체 메일 인증(F-31a)을 거쳐야 한다"는 표시가 된다. 기존 문자열
  // intent의 의미는 그대로다(그 주소는 이미 검증된 것이므로 자체 인증을 건너뛴다).
  // 실제 DB 변경은 0017-social-signup-email 마이그레이션이 적용한다.
  const SocialSignupIntent = sequelize.define('SocialSignupIntent', {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    intent_token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    provider: { type: DataTypes.STRING(30), allowNull: false },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    email: { type: DataTypes.STRING(100), allowNull: true },
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
