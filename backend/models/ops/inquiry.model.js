// 플레이어 문의 표(inquiries) 모델, 종류·제목·본문·답 기다림/답함
// models/index.js가 읽음, 플레이어 /inquiries·관리자 /admin-api/inquiries가 씀 (마이그레이션 0032)
module.exports = (sequelize, DataTypes) => {
  const Inquiry = sequelize.define('Inquiry', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    // BUG·ACCOUNT·ETC
    category: { type: DataTypes.STRING(20), allowNull: false },
    // 금지어 가린 뒤 저장
    title: { type: DataTypes.STRING(100), allowNull: false },
    body: { type: DataTypes.STRING(2000), allowNull: false },
    // OPEN(답 기다림) · ANSWERED(답함)
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'OPEN' },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    answered_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'inquiries',
    timestamps: false,
    indexes: [
      { fields: ['status', 'created_at'], name: 'inquiries_status_created_idx' },
      { fields: ['user_id', 'created_at'], name: 'inquiries_user_created_idx' },
    ],
  });

  Inquiry.associate = (models) => {
    Inquiry.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
    Inquiry.hasMany(models.InquiryReply, { foreignKey: 'inquiry_id', sourceKey: 'id' });
  };

  return Inquiry;
};
