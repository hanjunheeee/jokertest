// 약관 동의 기록 표(user_terms_agreements) 모델, 누가 어느 약관 버전에 언제 동의 (IP 안 남김)
// models/index.js가 읽음, 약관 저장소가 가입·재동의 때 씀 (탈퇴해도 기록은 uuid로 남김, 마이그레이션 0026)
module.exports = (sequelize, DataTypes) => {
  const UserTermsAgreement = sequelize.define('UserTermsAgreement', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    terms_version_id: { type: DataTypes.INTEGER, allowNull: false },
    agreed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'user_terms_agreements',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['user_id', 'terms_version_id'], name: 'user_terms_agreements_user_version_unique' },
      { fields: ['terms_version_id'], name: 'user_terms_agreements_version_idx' },
    ],
  });

  UserTermsAgreement.associate = (models) => {
    UserTermsAgreement.belongsTo(models.TermsVersion, { foreignKey: 'terms_version_id', targetKey: 'id' });
    UserTermsAgreement.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return UserTermsAgreement;
};
