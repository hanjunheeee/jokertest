// 친구 요청 내역 모델 정의
/**
 * @desc    유저 간의 친구 요청 상태(대기, 수락, 거절)와 메시지 내역을 저장하는 모델입니다.
 * @param   {Object} sequelize - 데이터베이스 연결 객체
 * @param   {Object} DataTypes - 컬럼의 데이터 타입을 정의하는 객체
 * @returns {Object} FriendRequest 모델
 */
module.exports = (sequelize, DataTypes) => {
  const FriendRequest = sequelize.define('FriendRequest', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, // 고유 식별자 (기본키)
    requester_id: { type: DataTypes.UUID, allowNull: false },               // 친구 요청을 보낸 유저의 UUID
    receiver_id: { type: DataTypes.UUID, allowNull: false },                // 친구 요청을 받은 유저의 UUID
    status: { type: DataTypes.STRING(20), defaultValue: 'PENDING' },        // 요청 상태 (PENDING: 대기, ACCEPTED: 수락, DECLINED: 거절)
    message: { type: DataTypes.TEXT },                                      // 요청 시 함께 보낸 인사말 (예: "저랑 친구해요!")
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },      // 요청을 보낸 일시
    responded_at: { type: DataTypes.DATE },                                 // 상대방이 수락 또는 거절을 완료한 일시
  }, {
    tableName: 'friend_requests', // 실제 DB에 생성될 테이블 이름
    timestamps: false,            // 자동 생성되는 시간 컬럼 사용 안 함 (수동 관리)
  });

  // 모델 간의 관계(Associations) 정의
  /**
   * 핵심 포인트: 하나의 친구 요청 내역은 두 명의 유저(보낸 사람, 받은 사람)와 연결됩니다.
   * Sequelize가 헷갈리지 않도록 `as` 속성을 이용해 각각 'Requester'와 'Receiver'라는 별칭으로 명확하게 묶어줍니다.
   */
  FriendRequest.associate = (models) => {
    // 이 요청의 '보낸 사람(Requester)'은 User 테이블의 한 명입니다.
    FriendRequest.belongsTo(models.User, { as: 'Requester', foreignKey: 'requester_id', targetKey: 'uuid' });
    
    // 이 요청의 '받은 사람(Receiver)'도 User 테이블의 한 명입니다.
    FriendRequest.belongsTo(models.User, { as: 'Receiver', foreignKey: 'receiver_id', targetKey: 'uuid' });
  };

  return FriendRequest;
};