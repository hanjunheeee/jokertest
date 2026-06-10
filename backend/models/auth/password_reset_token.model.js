// 비밀번호 재설정 토큰 모델 정의
/**
 * @desc    비밀번호 찾기 시 유저에게 발급되는 1회용 인증 토큰을 관리하는 모델입니다.
 * 토큰의 유효기간(expired_at)과 사용 여부(used)를 체크하여 안전한 비밀번호 변경을 지원합니다.
 * @param   {Object} sequelize - 데이터베이스 연결 객체
 * @param   {Object} DataTypes - 컬럼의 데이터 타입을 정의하는 객체
 * @returns {Object} PasswordResetToken 모델
 */
module.exports = (sequelize, DataTypes) => {
  const PasswordResetToken = sequelize.define('PasswordResetToken', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, // 고유 식별자 (기본키)
    user_id: { type: DataTypes.UUID, allowNull: false },                    // 비밀번호를 재설정할 유저의 UUID (User 테이블 참조)
    token: { type: DataTypes.STRING(255), allowNull: false },               // 인증에 사용될 고유 토큰 (보안 문자열)
    expired_at: { type: DataTypes.DATE, allowNull: false },                 // 토큰 만료 일시 (이 시간이 지나면 무효 처리됨)
    used: { type: DataTypes.BOOLEAN, defaultValue: false },                 // 토큰 사용 여부 (true: 사용 완료, false: 미사용) - 1회성 보장용
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },      // 토큰 발급 일시
  }, {
    tableName: 'password_reset_tokens', // 실제 DB에 생성될 테이블 이름
    timestamps: false,                  // 생성/수정 시간 자동 관리 기능 끄기 (created_at으로 자체 관리)
  });

  // 모델 간의 관계(Associations) 정의
  PasswordResetToken.associate = (models) => {
    // 1:N 관계 설정: 한 명의 유저가 여러 번의 재설정 토큰을 발급받을 수 있으므로 User에 속합니다(belongsTo).
    PasswordResetToken.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return PasswordResetToken;
};