// 외부 계정 연결 표(external_identities) 모델, 소셜 제공자 계정 ↔ 우리 계정
// models/index.js가 읽음, 외부 계정 저장소가 소셜 로그인·연결·가입 때 씀
module.exports = (sequelize, DataTypes) => {
  const ExternalIdentity = sequelize.define('ExternalIdentity', {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    // 제공자 이름 + 그쪽 계정 id, 둘 묶음이 유일 (한 소셜 계정은 한 계정에만)
    provider: { type: DataTypes.STRING(30), allowNull: false },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    // 연결 때 받은 이메일 기록용 (로그인 판단엔 안 씀)
    email_snapshot: { type: DataTypes.STRING(100), allowNull: true },
  }, {
    tableName: 'external_identities',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { name: 'external_identities_provider_subject_unique', unique: true, fields: ['provider', 'subject'] },
    ],
  });

  ExternalIdentity.associate = (models) => {
    ExternalIdentity.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return ExternalIdentity;
};
