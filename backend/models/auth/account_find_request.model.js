module.exports = (sequelize, DataTypes) => {
  const AccountFindRequest = sequelize.define('AccountFindRequest', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // F-29a: 아이디 찾기(닉네임+생년월일 조회)는 이메일을 아직 모르는 상태에서 사건을
    // 기록해야 하므로 email이 nullable이다(0014-find-id-requests 마이그레이션이 실제 DB
    // 컬럼을 이 정의와 맞춘다).
    email: { type: DataTypes.STRING(100), allowNull: true },
    request_type: { type: DataTypes.STRING(30) },
    ip_address: { type: DataTypes.STRING(45) },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'account_find_requests',
    timestamps: false,
  });

  AccountFindRequest.associate = (models) => {
    // 다른 테이블과 외래키 관계 없는 독립적인 로그 테이블
  };

  return AccountFindRequest;
};
