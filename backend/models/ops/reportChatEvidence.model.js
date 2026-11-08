// 신고 채팅 증거 표(report_chat_evidence) 모델, 신고 때 그 판 채팅 묶음 한 줄
// models/index.js가 읽음, 신고 접수가 저장·90일 정리가 지움 (마이그레이션 0024)
module.exports = (sequelize, DataTypes) => {
  const ReportChatEvidence = sequelize.define('ReportChatEvidence', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    report_id: { type: DataTypes.BIGINT, allowNull: false },
    game_id: { type: DataTypes.STRING(64), allowNull: false },
    // [{ at, channel, senderUuid, nickname, text }]
    messages: { type: DataTypes.JSON, allowNull: false },
    saved_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'report_chat_evidence',
    timestamps: false,
    indexes: [
      { fields: ['report_id'], name: 'report_chat_evidence_report_idx' },
      { fields: ['saved_at'], name: 'report_chat_evidence_saved_idx' },
    ],
  });

  ReportChatEvidence.associate = (models) => {
    ReportChatEvidence.belongsTo(models.Report, { foreignKey: 'report_id', targetKey: 'id' });
  };

  return ReportChatEvidence;
};
