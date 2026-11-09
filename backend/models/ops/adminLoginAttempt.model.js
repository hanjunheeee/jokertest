// 관리자 로그인 시도 표(admin_login_attempts) 모델, 성공·실패 한 줄씩 (잠깐 막기 셈 + 실패 기록)
// models/index.js가 읽음, /admin-api 로그인이 씀 (마이그레이션 0031)
module.exports = (sequelize, DataTypes) => {
  const AdminLoginAttempt = sequelize.define('AdminLoginAttempt', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    // 없는 아이디도 그대로 적음 (아이디마다 셈)
    login_id: { type: DataTypes.STRING(50), allowNull: false },
    admin_id: { type: DataTypes.UUID, allowNull: true },
    ip: { type: DataTypes.STRING(45), allowNull: false },
    access_email: { type: DataTypes.STRING(255), allowNull: true },
    ok: { type: DataTypes.BOOLEAN, allowNull: false },
    // BAD_CREDENTIALS·LOCKED·EMAIL_MISMATCH·DISABLED
    failure_code: { type: DataTypes.STRING(40), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'admin_login_attempts',
    timestamps: false,
    indexes: [
      { fields: ['login_id', 'created_at'], name: 'admin_login_attempts_login_created_idx' },
      { fields: ['ip', 'created_at'], name: 'admin_login_attempts_ip_created_idx' },
    ],
  });

  return AdminLoginAttempt;
};
