// 관리자 로그인 세션 표(admin_sessions) 모델, 쿠키 sha256·자동 로그아웃 시각·끊은 시각
// models/index.js가 읽음, /admin-api 세션 확인이 씀 (마이그레이션 0031)
module.exports = (sequelize, DataTypes) => {
  const AdminSession = sequelize.define('AdminSession', {
    // 쿠키 원문의 sha256 (원문은 DB에 없음)
    id: { type: DataTypes.CHAR(64), primaryKey: true, allowNull: false },
    admin_id: { type: DataTypes.UUID, allowNull: false },
    access_email: { type: DataTypes.STRING(255), allowNull: true },
    ip: { type: DataTypes.STRING(45), allowNull: true },
    user_agent: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    // 가만히 30분 판정용 (1분에 한 번만 고침)
    last_seen_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'admin_sessions',
    timestamps: false,
    indexes: [
      { fields: ['admin_id', 'revoked_at'], name: 'admin_sessions_admin_revoked_idx' },
      { fields: ['expires_at'], name: 'admin_sessions_expires_idx' },
    ],
  });

  AdminSession.associate = (models) => {
    AdminSession.belongsTo(models.AdminUser, { foreignKey: 'admin_id', targetKey: 'id' });
  };

  return AdminSession;
};
