/**
 * 친구 관계 Sequelize 모델.
 *
 * 수락된 양방향 친구 관계를 requester/receiver 컬럼으로 저장합니다.
 */
// 확정된 친구 관계 모델 정의
/**
 * @desc    친구 요청이 수락(ACCEPTED)되어 정식으로 친구가 된 유저 간의 관계를 저장하는 모델입니다.
 * 추후 친구 차단(BLOCKED) 등 관계 상태가 변할 수 있으므로 상태값과 업데이트 시간을 관리합니다.
 * @param   {Object} sequelize - 데이터베이스 연결 객체
 * @param   {Object} DataTypes - 컬럼의 데이터 타입을 정의하는 객체
 * @returns {Object} Friendship 모델
 */
module.exports = (sequelize, DataTypes) => {
  const Friendship = sequelize.define('Friendship', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, // 고유 식별자 (기본키)
    requester_id: { type: DataTypes.UUID, allowNull: false },               // 처음 친구 요청을 보냈던 유저의 UUID
    receiver_id: { type: DataTypes.UUID, allowNull: false },                // 친구 요청을 수락한 유저의 UUID
    status: { type: DataTypes.STRING(20), defaultValue: 'ACCEPTED' },       // 현재 관계 상태 (기본값 ACCEPTED, 향후 BLOCKED 등으로 활용)
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },      // 처음 친구가 된 일시
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },      // 관계 상태가 마지막으로 변경된 일시
  }, {
    tableName: 'friendships', // 실제 DB에 생성될 테이블 이름
    timestamps: true,         // Sequelize가 데이터 수정 시 updated_at을 자동으로 갱신하도록 설정
    createdAt: 'created_at',  // Sequelize 기본명(createdAt)을 DB 컬럼명에 맞게 매핑
    updatedAt: 'updated_at',  // Sequelize 기본명(updatedAt)을 DB 컬럼명에 맞게 매핑
  });

  // 모델 간의 관계(Associations) 정의
  /**
   * 핵심 포인트: 친구 관계 역시 두 명의 유저가 연결된 데이터입니다.
   * 서비스 로직에서 양방향 데이터를 조회(Join)할 때 명확히 구분할 수 있도록 
   * 'Friend1(요청자)'과 'Friend2(수락자)'라는 직관적인 별칭(as)을 부여합니다.
   */
  Friendship.associate = (models) => {
    // 관계의 시작점인 '요청자'를 Friend1으로 매핑
    Friendship.belongsTo(models.User, { as: 'Friend1', foreignKey: 'requester_id', targetKey: 'uuid' });
    
    // 관계를 완성한 '수락자'를 Friend2로 매핑
    Friendship.belongsTo(models.User, { as: 'Friend2', foreignKey: 'receiver_id', targetKey: 'uuid' });
  };

  return Friendship;
};
