module.exports = (sequelize, DataTypes) => {
  // F-05 AC-01: provider(구글/카카오 등)와 subject(제공자가 발급한 고유 사용자 ID)의 조합이
  // 한 계정만 가리켜야 한다. 같은 조합으로 두 번째 행을 만들려는 시도는 DB 유일 제약이
  // 거부한다(하단 unique index) — 서비스 계층의 사전 조회만으로는 동시 콜백 경합을 막을 수
  // 없기 때문에, F-02 users.email/nickname과 같은 원칙으로 DB 제약을 최종 방어선으로 둔다.
  const ExternalIdentity = sequelize.define('ExternalIdentity', {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    provider: { type: DataTypes.STRING(30), allowNull: false },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    // 콜백 시점에 제공자가 준 이메일의 스냅샷이다. users.email(가변)과 달리 링크 당시
    // 값을 그대로 남겨, 이후 이메일이 바뀌어도 "어떤 이메일로 연결됐었는지"를 추적할 수 있다.
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
