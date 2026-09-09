module.exports = (sequelize, DataTypes) => {
  const UserSession = sequelize.define('UserSession', {
    id: { type: DataTypes.STRING(255), primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    ip_address: { type: DataTypes.STRING(45) },
    connected_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    last_ping_at: { type: DataTypes.DATE },
    is_online: { type: DataTypes.BOOLEAN, defaultValue: true },
    // F-03: 로그인 유지(rememberMe) 세션의 회전형 갱신 자격. 원문 비밀값은 저장하지 않고
    // sha256 해시만 저장한다(user.repositories.js의 hashRefreshToken).
    refresh_token_hash: { type: DataTypes.STRING(64), allowNull: true },
    // 방금 회전되어 대체된 이전 해시. 회전 응답 유실·동시 요청 재시도를 짧은 유예 동안만
    // 허용하기 위한 것으로, 유예가 지나거나 다른 값이 오면 재사용(탈취)으로 간주한다.
    refresh_previous_hash: { type: DataTypes.STRING(64), allowNull: true },
    refresh_previous_expires_at: { type: DataTypes.DATE, allowNull: true },
    // 로그인 시점 기준 절대 만료(30일) — 회전으로 연장되지 않는다.
    refresh_token_expires_at: { type: DataTypes.DATE, allowNull: true },
    // 로그아웃·비밀번호 변경·재사용 감지 등으로 이 세션(및 그 갱신 자격)이 폐기된 시각.
    revoked_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'user_sessions',
    timestamps: false,
  });

  UserSession.associate = (models) => {
    UserSession.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return UserSession;
};
