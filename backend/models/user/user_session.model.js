/**
 * 유저 세션 Sequelize 모델.
 *
 * JWT payload의 sessionId와 연결되는 서버 측 접속 세션 기록입니다.
 */
// 유저 접속 세션 모델 정의
/**
 * @desc    유저의 개별 접속 세션(기기 단위)을 관리하는 모델입니다.
 * 다중 접속을 제어(중복 로그인 방지)하거나, 주기적인 신호(Ping)를 체크하여 브라우저 강제 종료 같은 비정상 이탈을 감지할 때 핵심적으로 활용됩니다.
 * @param   {Object} sequelize - 데이터베이스 연결 객체
 * @param   {Object} DataTypes - 컬럼의 데이터 타입을 정의하는 객체
 * @returns {Object} UserSession 모델
 */
module.exports = (sequelize, DataTypes) => {
  const UserSession = sequelize.define('UserSession', {
    id: { type: DataTypes.STRING(255), primaryKey: true },               // 세션 고유 식별자 (기본키, 로그인 시 발급된 Session UUID)
    user_id: { type: DataTypes.UUID, allowNull: false },                 // 세션을 생성한 유저의 UUID (User 테이블 참조)
    ip_address: { type: DataTypes.STRING(45) },                          // 해당 세션으로 접속한 클라이언트의 IP 주소
    connected_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }, // 최초 접속(로그인) 일시
    last_ping_at: { type: DataTypes.DATE },                              // 클라이언트로부터 마지막 생존 신호(하트비트)를 받은 일시
    is_online: { type: DataTypes.BOOLEAN, defaultValue: true },          // 현재 세션의 활성화(온라인) 여부 (새로운 기기에서 접속하면 기존 세션은 false 처리됨)
  }, {
    tableName: 'user_sessions', // 실제 DB에 생성될 테이블 이름
    timestamps: false,          // 생성/수정 시간 자동 관리 기능 끄기 (자체 관리)
  });

  // 모델 간의 관계(Associations) 정의
  UserSession.associate = (models) => {
    // 1:N 관계 설정: 한 명의 유저가 여러 기기나 브라우저에서 동시에(혹은 순차적으로) 세션을 만들 수 있으므로 User에 속합니다.
    UserSession.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return UserSession;
};
