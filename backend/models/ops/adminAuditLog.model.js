// 관리자 행동 기록 표(admin_audit_logs) 모델, 누가·무엇을·어디에·전후 값·IP
// models/index.js가 읽음, 게임 서버는 안 씀 (관리자 서버가 쓰기만, 마이그레이션 0024)
module.exports = (sequelize, DataTypes) => {
  const AdminAuditLog = sequelize.define('AdminAuditLog', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    admin_id: { type: DataTypes.UUID, allowNull: false },
    action: { type: DataTypes.STRING(60), allowNull: false },
    target_type: { type: DataTypes.STRING(40), allowNull: true },
    target_id: { type: DataTypes.STRING(64), allowNull: true },
    before_value: { type: DataTypes.JSON, allowNull: true },
    after_value: { type: DataTypes.JSON, allowNull: true },
    ip: { type: DataTypes.STRING(45), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'admin_audit_logs',
    timestamps: false,
    indexes: [
      { fields: ['admin_id', 'created_at'], name: 'admin_audit_logs_admin_created_idx' },
      { fields: ['target_type', 'target_id'], name: 'admin_audit_logs_target_idx' },
      { fields: ['created_at'], name: 'admin_audit_logs_created_idx' },
    ],
  });

  AdminAuditLog.associate = (models) => {
    AdminAuditLog.belongsTo(models.AdminUser, { foreignKey: 'admin_id', targetKey: 'id' });
  };

  return AdminAuditLog;
};
