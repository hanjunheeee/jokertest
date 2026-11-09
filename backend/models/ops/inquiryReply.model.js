// 문의 답 표(inquiry_replies) 모델, 관리자가 단 답 (플레이어에겐 "운영팀"으로 보임)
// models/index.js가 읽음, 관리자 문의 답·플레이어 문의 상세가 씀 (마이그레이션 0032)
module.exports = (sequelize, DataTypes) => {
  const InquiryReply = sequelize.define('InquiryReply', {
    // 알림 출처 키 inquiry-reply:<이 id>
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    inquiry_id: { type: DataTypes.BIGINT, allowNull: false },
    admin_id: { type: DataTypes.UUID, allowNull: false },
    body: { type: DataTypes.STRING(2000), allowNull: false },
    // 같은 요청 번호면 처음 답 한 줄만
    request_id: { type: DataTypes.STRING(64), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'inquiry_replies',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['request_id'], name: 'inquiry_replies_request_id_unique' },
      { fields: ['inquiry_id', 'created_at'], name: 'inquiry_replies_inquiry_created_idx' },
    ],
  });

  InquiryReply.associate = (models) => {
    InquiryReply.belongsTo(models.Inquiry, { foreignKey: 'inquiry_id', targetKey: 'id' });
    InquiryReply.belongsTo(models.AdminUser, { foreignKey: 'admin_id', targetKey: 'id' });
  };

  return InquiryReply;
};
