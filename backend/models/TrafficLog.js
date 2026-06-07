// 트래픽 로그 모델 정의
/**
 * @desc    서버로 들어오는 모든 API 요청(트래픽) 내역을 기록하는 모델입니다.
 * 어떤 IP에서 어떤 메서드로 어느 주소를 호출했는지, 응답 속도와 상태 코드는 어땠는지 서버 모니터링 및 디버깅용으로 사용됩니다.
 * @param   {Object} sequelize - 데이터베이스 연결 객체
 * @param   {Object} DataTypes - 컬럼의 데이터 타입을 정의하는 객체
 * @returns {Object} TrafficLog 모델
 */
module.exports = (sequelize, DataTypes) => {
  const TrafficLog = sequelize.define('TrafficLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, // 고유 식별자 (기본키)
    url: { type: DataTypes.TEXT, allowNull: false },                        // 클라이언트가 요청한 API 엔드포인트 또는 주소
    method: { type: DataTypes.STRING(10), allowNull: false },               // HTTP 요청 메서드 (예: GET, POST, PUT, DELETE)
    response_status: { type: DataTypes.INTEGER },                           // 서버가 내려준 응답 상태 코드 (예: 200, 404, 500)
    ip_address: { type: DataTypes.STRING(45) },                             // 요청을 보낸 클라이언트의 IP 주소 (IPv6 고려 45자)
    response_time_ms: { type: DataTypes.INTEGER },                          // 요청 처리부터 응답까지 걸린 시간 (ms 단위, 병목 파악용)
    accessed_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },     // 요청이 들어온 일시
  }, {
    tableName: 'traffic_logs', // 실제 DB에 생성될 테이블 이름
    timestamps: false,         // 생성/수정 시간 자동 관리 기능 끄기 (accessed_at으로 자체 관리)
  });

  // 모델 간의 관계(Associations) 정의
  TrafficLog.associate = (models) => {
    // 서버 전반적인 API 접근 로그를 남기는 독립적인 통계용 테이블이므로, 현재 다른 모델과의 관계(외래키)는 맺지 않습니다.
  };

  return TrafficLog;
};