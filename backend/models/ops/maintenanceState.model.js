// 점검 상태 표(maintenance_state) 모델, id 1 한 줄 (켜짐·안내 문구·시작·끝 예정)
// models/index.js가 읽음, 점검 서비스가 시작 때·reload 때 읽음 (마이그레이션 0024)
module.exports = (sequelize, DataTypes) => {
  const MaintenanceState = sequelize.define('MaintenanceState', {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    is_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    message: { type: DataTypes.STRING(500), allowNull: true },
    starts_at: { type: DataTypes.DATE, allowNull: true },
    ends_at: { type: DataTypes.DATE, allowNull: true },
    updated_by_admin_id: { type: DataTypes.UUID, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'maintenance_state',
    timestamps: false,
  });
  return MaintenanceState;
};
