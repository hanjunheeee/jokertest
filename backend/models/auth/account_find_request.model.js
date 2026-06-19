/**
 * 계정 찾기 요청 Sequelize 모델.
 *
 * 이메일/비밀번호 찾기 요청 이력을 저장해 요청 추적과 남용 방지에 활용합니다.
 */
// 계정 찾기 요청 내역 모델 정의
/**
 * @desc    아이디 찾기, 비밀번호 재설정 등 계정 관련 인증 요청 내역을 저장하는 모델입니다.
 * 보안 감사 및 어뷰징(무한 반복 요청) 방지를 위해 요청자의 이메일, 요청 종류, 접속 IP를 기록합니다.
 * @param   {Object} sequelize - 데이터베이스 연결 객체
 * @param   {Object} DataTypes - 컬럼의 데이터 타입을 정의하는 객체
 * @returns {Object} AccountFindRequest 모델
 */
module.exports = (sequelize, DataTypes) => {
  const AccountFindRequest = sequelize.define('AccountFindRequest', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, // 고유 식별자 (기본키)
    email: { type: DataTypes.STRING(100), allowNull: false },               // 계정 찾기를 시도한 대상 이메일
    request_type: { type: DataTypes.STRING(30) },                           // 요청 종류 (예: 'FIND_ID', 'RESET_PW')
    ip_address: { type: DataTypes.STRING(45) },                             // 요청자의 IP 주소 (IPv6 길이를 고려해 45자)
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },      // 요청 발생 일시
  }, {
    tableName: 'account_find_requests', // 실제 DB에 생성될 테이블 이름
    timestamps: false,                  // createdAt, updatedAt 자동 생성 기능 끄기 (수동 관리)
  });

  // 모델 간의 관계(Associations) 정의
  AccountFindRequest.associate = (models) => {
    // 현재는 다른 테이블(유저 등)과 직접적인 외래키(FK) 관계를 맺고 있지 않습니다. (독립적인 로그 테이블 역할)
  };

  return AccountFindRequest;
};
