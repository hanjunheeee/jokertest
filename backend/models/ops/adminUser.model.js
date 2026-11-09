// 관리자 계정 표(admin_users) 모델, 게임 계정과 따로 (아이디·비번 해시·권한·2단계 비밀)
// models/index.js가 읽음, 게임 서버 /admin-api 로그인·계정 명령이 씀 (마이그레이션 0024·0031)
module.exports = (sequelize, DataTypes) => {
  const AdminUser = sequelize.define('AdminUser', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    login_id: { type: DataTypes.STRING(50), allowNull: false },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    // SUPER·OPERATOR·VIEWER
    role: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'VIEWER' },
    totp_secret: { type: DataTypes.STRING(255), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    last_login_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    // 0031: Access 이메일 맞추기 · 쓴 OTP 칸 번호(다시 못 쓰게) · 비번 바꾼 시각
    email: { type: DataTypes.STRING(255), allowNull: true },
    totp_last_step: { type: DataTypes.BIGINT, allowNull: true },
    password_changed_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'admin_users',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['login_id'], name: 'admin_users_login_id_unique' },
      { unique: true, fields: ['email'], name: 'admin_users_email_unique' },
    ],
  });

  AdminUser.associate = (models) => {
    AdminUser.hasMany(models.AdminAuditLog, { foreignKey: 'admin_id', sourceKey: 'id' });
    AdminUser.hasMany(models.AdminSession, { foreignKey: 'admin_id', sourceKey: 'id' });
  };

  return AdminUser;
};
