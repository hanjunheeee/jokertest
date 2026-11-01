// 계정 찾기 요청 표(account_find_requests) 모델, 아이디 찾기 시도마다 한 줄
// models/index.js가 읽음, 아이디 찾기 요청 저장소가 쓰기만 함 (읽는 곳 없음, 요청 한도는 미들웨어가 따로 셈)
module.exports = (sequelize, DataTypes) => {
  const AccountFindRequest = sequelize.define('AccountFindRequest', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // 아이디 찾기는 이메일을 모르는 채로 오니까 비워 둠
    email: { type: DataTypes.STRING(100), allowNull: true },
    // 지금은 FIND_ID만 씀
    request_type: { type: DataTypes.STRING(30) },
    ip_address: { type: DataTypes.STRING(45) },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'account_find_requests',
    timestamps: false,
  });

  // 다른 표와 관계 없음
  AccountFindRequest.associate = (models) => {
  };

  return AccountFindRequest;
};
