// 계정 정지(Ban) 내역 모델 정의
/**
 * @desc    운영정책을 위반한 불량 유저의 서비스 이용 제한(정지) 내역을 관리하는 모델입니다.
 * 영구 정지 여부(is_permanent)와 정지 기간(start_at, end_at) 데이터를 기반으로 로그인 시 접근을 차단합니다.
 * @param   {Object} sequelize - 데이터베이스 연결 객체
 * @param   {Object} DataTypes - 컬럼의 데이터 타입을 정의하는 객체
 * @returns {Object} UserBan 모델
 */
module.exports = (sequelize, DataTypes) => {
  const UserBan = sequelize.define('UserBan', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, // 고유 식별자 (기본키)
    user_id: { type: DataTypes.UUID, allowNull: false },                    // 정지당한 불량 유저의 UUID (User 테이블 참조)
    reason: { type: DataTypes.TEXT },                                       // 제재 사유 (예: 욕설, 불법 프로그램 사용 등)
    banned_by: { type: DataTypes.INTEGER },                                 // 정지 처리를 내린 관리자의 ID (어드민 추적용)
    is_permanent: { type: DataTypes.BOOLEAN, defaultValue: false },         // 영구 정지 여부 (true면 end_at과 무관하게 영구 차단)
    start_at: { type: DataTypes.DATE },                                     // 정지 시작 일시
    end_at: { type: DataTypes.DATE },                                       // 정지 종료 일시 (기간제 정지일 경우 로그인 차단 해제 기준일)
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },      // 정지 처리 기록이 생성된 일시
  }, {
    tableName: 'user_bans', // 실제 DB에 생성될 테이블 이름
    timestamps: false,      // 생성/수정 시간 자동 관리 기능 끄기 (created_at으로 자체 관리)
  });

  // 모델 간의 관계(Associations) 정의
  UserBan.associate = (models) => {
    // 1:N 관계 설정: 한 명의 유저가 여러 번의 제재(3일 정지 후 또 7일 정지 등)를 받을 수 있으므로 User에 속합니다.
    UserBan.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return UserBan;
};