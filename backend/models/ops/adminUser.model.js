// 관리자 계정 표(admin_users) 모델, 게임 계정과 따로 (아이디·비번 해시·권한·2단계 비밀)
// models/index.js가 읽음, 게임 서버는 안 씀 (관리자 서버 몫, 마이그레이션 0024)
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
  }, {
    tableName: 'admin_users',
    timestamps: false,
    indexes: [{ unique: true, fields: ['login_id'], name: 'admin_users_login_id_unique' }],
  });

  AdminUser.associate = (models) => {
    AdminUser.hasMany(models.AdminAuditLog, { foreignKey: 'admin_id', sourceKey: 'id' });
  };

  return AdminUser;
};
