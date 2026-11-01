// 친구 신청 표(friend_requests) 모델, 신청 한 번에 한 줄 (끝난 신청도 이력으로 남음)
// models/index.js가 읽음, 친구 신청 저장소가 씀
module.exports = (sequelize, DataTypes) => {
  const FriendRequest = sequelize.define('FriendRequest', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    requester_id: { type: DataTypes.UUID, allowNull: false },
    receiver_id: { type: DataTypes.UUID, allowNull: false },
    // PENDING → ACCEPTED·DECLINED·CANCELLED
    // 두 사람 사이 PENDING은 DB가 한 줄만 받음 (모델에 없는 pending_pair_key 칸)
    status: { type: DataTypes.STRING(20), defaultValue: 'PENDING' },
    // 신청 목록에 같이 보냄, 지금 신청 만들 때는 안 넣음
    message: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    // 수락·거절·취소한 시각
    responded_at: { type: DataTypes.DATE },
  }, {
    tableName: 'friend_requests',
    timestamps: false,
  });

  FriendRequest.associate = (models) => {
    FriendRequest.belongsTo(models.User, { as: 'Requester', foreignKey: 'requester_id', targetKey: 'uuid' });
    FriendRequest.belongsTo(models.User, { as: 'Receiver', foreignKey: 'receiver_id', targetKey: 'uuid' });
  };

  return FriendRequest;
};
