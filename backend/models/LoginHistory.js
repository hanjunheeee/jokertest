// 로그인 히스토리 모델 정의
/**
 * @desc    유저의 로그인 성공/실패 이력, 접속 IP, 기기 정보 등을 기록하는 모델입니다.
 * 보안 감사, 어뷰징 탐지(비밀번호 연속 실패 등) 및 접속 통계에 핵심적으로 사용됩니다.
 * @param   {Object} sequelize - 데이터베이스 연결 객체
 * @param   {Object} DataTypes - 컬럼의 데이터 타입을 정의하는 객체
 * @returns {Object} LoginHistory 모델
 */
module.exports = (sequelize, DataTypes) => {
  const LoginHistory = sequelize.define('LoginHistory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, // 고유 식별자 (기본키)
    user_id: { type: DataTypes.UUID, allowNull: false },                    // 로그인을 시도한 유저의 UUID (User 테이블 참조)
    ip_address: { type: DataTypes.STRING(45) },                             // 접속을 시도한 IP 주소 (IPv6 길이 대응을 위해 45자)
    user_agent: { type: DataTypes.TEXT },                                   // 접속 환경(브라우저, OS 등) 원본 문자열
    device_type: { type: DataTypes.STRING(20) },                            // 파싱된 기기 종류 (PC, MOBILE, TABLET 등)
    login_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },        // 로그인(또는 시도) 일시
    logout_at: { type: DataTypes.DATE },                                    // 명시적으로 로그아웃한 일시
    success: { type: DataTypes.BOOLEAN, allowNull: false },                 // 로그인 성공 여부 (true: 성공, false: 비번 오입력 등 실패)
  }, {
    tableName: 'login_history', // 실제 DB에 생성될 테이블 이름
    timestamps: false,          // 생성/수정 시간 자동 관리 기능 끄기 (login_at으로 자체 관리)
  });

  // 모델 간의 관계(Associations) 정의
  LoginHistory.associate = (models) => {
    // 1:N 관계 설정: 여러 개의 로그인 기록(N)은 단 한 명의 특정 유저(1)에게 속합니다.
    LoginHistory.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return LoginHistory;
};