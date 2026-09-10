module.exports = (sequelize, DataTypes) => {
  // F-05 AC-05: OAuth 콜백이 받는 state는 CSRF/재생 공격을 막는 1회용 값이다. 원문은
  // 저장하지 않고(auth.service.js의 refresh_token_hash와 같은 원칙) sha256 해시만 둔다.
  // browser_fingerprint_hash는 state를 발급한 브라우저와 그것을 소비하는 요청이 같은
  // 브라우저인지 묶어(위조 방지), purpose는 이 state가 "로그인용"인지 "로그인 후 명시적
  // 계정 연결용"(AC-04, D-01)인지 구분한다 — link 용도는 user_id가 함께 채워진다.
  const OAuthState = sequelize.define('OAuthState', {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    state_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    purpose: { type: DataTypes.STRING(20), allowNull: false },
    // link 목적일 때만 채워진다 — 로그인 중인 사용자가 발급한 state라는 뜻이다.
    user_id: { type: DataTypes.UUID, allowNull: true },
    // F-05 AC-04 재검토 지적: link state는 user_id뿐 아니라 그것을 발급한 "특정 세션"에도
    // 결합된다. 발급 시점과 소비(콜백) 시점 모두 이 세션이 여전히 유효한지
    // (user.repositories.js의 findActiveSession)를 다시 확인해야, 로그아웃·세션 폐기 이후
    // 그 사이 알아낸(혹은 이미 만료된) userId만으로 연결이 완료되는 것을 막을 수 있다.
    session_id: { type: DataTypes.STRING(255), allowNull: true },
    browser_fingerprint_hash: { type: DataTypes.STRING(64), allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    // null이면 아직 소비되지 않은 state다. 소비 시점을 기록해 재사용을 거부한다.
    consumed_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'oauth_states',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });

  return OAuthState;
};
