// 신고 표(reports) 모델, 신고자·대상·판·사유 + 관리자 처리 상태
// models/index.js가 읽음, 게임 서버는 신고 접수만 씀 (처리는 관리자 서버, 마이그레이션 0024)
module.exports = (sequelize, DataTypes) => {
  const Report = sequelize.define('Report', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    reporter_id: { type: DataTypes.UUID, allowNull: false },
    target_id: { type: DataTypes.UUID, allowNull: false },
    game_id: { type: DataTypes.STRING(64), allowNull: false },
    reason_code: { type: DataTypes.STRING(40), allowNull: false },
    memo: { type: DataTypes.STRING(500), allowNull: true },
    // OPEN·RESOLVED·DISMISSED
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'OPEN' },
    handled_by_admin_id: { type: DataTypes.UUID, allowNull: true },
    handled_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'reports',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['reporter_id', 'target_id', 'game_id'], name: 'reports_reporter_target_game_unique' },
      { fields: ['status', 'created_at'], name: 'reports_status_created_idx' },
      { fields: ['target_id', 'created_at'], name: 'reports_target_created_idx' },
    ],
  });

  Report.associate = (models) => {
    Report.hasMany(models.ReportChatEvidence, { foreignKey: 'report_id', sourceKey: 'id' });
  };

  return Report;
};
