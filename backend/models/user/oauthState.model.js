// 소셜 로그인 state 표(oauth_states) 모델, 소셜 왕복 한 번에 한 줄 (한 번 쓰면 끝)
// models/index.js가 읽음, 외부 계정 저장소가 state 만들기·찾기·쓴 표시에 씀
module.exports = (sequelize, DataTypes) => {
  const OAuthState = sequelize.define('OAuthState', {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    // state 원문은 안 남기고 해시만
    state_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    // login(소셜 로그인) 또는 link(로그인한 계정에 소셜 연결)
    purpose: { type: DataTypes.STRING(20), allowNull: false },
    // link일 때만 채움, 연결할 계정과 그 세션
    user_id: { type: DataTypes.UUID, allowNull: true },
    session_id: { type: DataTypes.STRING(255), allowNull: true },
    // 시작한 브라우저에서만 돌아오게 브라우저 표시 해시와 맞춰 봄
    browser_fingerprint_hash: { type: DataTypes.STRING(64), allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    // 채워져 있으면 이미 쓴 state라 거절
    consumed_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'oauth_states',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });

  return OAuthState;
};
