// 로그인 세션 표(user_sessions) 모델, 세션 살아 있는지 + refresh 토큰 해시 회전 상태
// models/index.js가 읽음, 세션·refresh 저장소가 씀
module.exports = (sequelize, DataTypes) => {
  const UserSession = sequelize.define('UserSession', {
    // access 토큰 안 sessionId (발급 때 무작위 uuid)
    id: { type: DataTypes.STRING(255), primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    ip_address: { type: DataTypes.STRING(45) },
    connected_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    last_ping_at: { type: DataTypes.DATE },
    // 로그아웃·새 로그인·재사용 감지 때 false + revoked_at 채움
    is_online: { type: DataTypes.BOOLEAN, defaultValue: true },
    // 지금 refresh 토큰 해시 (로그인 유지 안 하면 null)
    refresh_token_hash: { type: DataTypes.STRING(64), allowNull: true },
    // 바로 전 토큰 해시, 짧은 유예 안에서만 같은 새 토큰을 다시 줌 (동시 요청 대비)
    refresh_previous_hash: { type: DataTypes.STRING(64), allowNull: true },
    refresh_previous_expires_at: { type: DataTypes.DATE, allowNull: true },
    // refresh 절대 만료, 회전해도 안 늘어남
    refresh_token_expires_at: { type: DataTypes.DATE, allowNull: true },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'user_sessions',
    timestamps: false,
  });

  // 더 옛 토큰 해시는 refresh_token_history 표에 따로 둠 (모델 없이 쿼리로 씀)
  UserSession.associate = (models) => {
    UserSession.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return UserSession;
};
