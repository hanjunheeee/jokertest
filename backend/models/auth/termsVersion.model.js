// 약관 버전 표(terms_versions) 모델, 종류(TERMS·PRIVACY)마다 버전 한 줄씩 (시행일 지난 것 중 가장 늦은 게 지금 버전)
// models/index.js가 읽음, 약관 저장소가 읽기만 함 (새 버전 넣기는 관리자 서버 몫, 마이그레이션 0026)
module.exports = (sequelize, DataTypes) => {
  const TermsVersion = sequelize.define('TermsVersion', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    kind: { type: DataTypes.STRING(20), allowNull: false },
    version: { type: DataTypes.STRING(40), allowNull: false },
    title: { type: DataTypes.STRING(100), allowNull: false },
    // 본문 또는 주소 (둘 다 있을 수 있음)
    body: { type: DataTypes.TEXT, allowNull: true },
    url: { type: DataTypes.STRING(500), allowNull: true },
    effective_at: { type: DataTypes.DATE, allowNull: false },
    // 필수면 동의 안 하면 가입·재동의 못 넘어감
    is_required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by_admin_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'terms_versions',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['kind', 'version'], name: 'terms_versions_kind_version_unique' },
      { fields: ['kind', 'effective_at'], name: 'terms_versions_kind_effective_idx' },
    ],
  });

  TermsVersion.associate = (models) => {
    TermsVersion.hasMany(models.UserTermsAgreement, { foreignKey: 'terms_version_id', sourceKey: 'id' });
  };

  return TermsVersion;
};
