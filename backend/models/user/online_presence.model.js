/**
 * 유저 온라인 상태 Sequelize 모델.
 *
 * Socket.io 연결/해제 이벤트를 ONLINE/OFFLINE 상태로 반영하는 1:1 presence 테이블입니다.
 */
// 온라인 접속 상태 모델 정의
/**
 * @desc    유저의 실시간 접속 상태(온라인, 오프라인, 게임 중)와 현재 위치(방 번호)를 관리하는 모델입니다.
 * 친구 목록이나 로비에서 해당 유저가 지금 활동 중인지 보여줄 때 핵심적으로 사용됩니다.
 * @param   {Object} sequelize - 데이터베이스 연결 객체
 * @param   {Object} DataTypes - 컬럼의 데이터 타입을 정의하는 객체
 * @returns {Object} OnlinePresence 모델
 */
module.exports = (sequelize, DataTypes) => {
  const OnlinePresence = sequelize.define('OnlinePresence', {
    user_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false }, // 접속 상태를 추적할 유저의 UUID (기본키로 사용)
    status: { type: DataTypes.STRING(20), defaultValue: 'ONLINE' },        // 현재 상태 (ONLINE, OFFLINE, IN_GAME 등)
    last_active_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }, // 마지막 활동 시간 (향후 '자리 비움' 처리 등에 활용)
    current_room_id: { type: DataTypes.INTEGER },                          // 유저가 현재 참여 중인 게임 방 번호 (로비 대기 중이면 null)
  }, {
    tableName: 'online_presence', // 실제 DB에 생성될 테이블 이름
    timestamps: false,            // 잦은 업데이트가 일어나므로 불필요한 자동 시간 생성 컬럼 끄기
  });

  // 모델 간의 관계(Associations) 정의
  OnlinePresence.associate = (models) => {
    // 특정 유저의 상태 정보이므로 User 테이블에 속합니다.
    // (user_id가 기본키이자 외래키 역할을 하여 실질적으로 User와 1:1 관계를 형성합니다.)
    OnlinePresence.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return OnlinePresence;
};
