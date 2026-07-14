module.exports = (sequelize, DataTypes) => {
  const FriendRequest = sequelize.define('FriendRequest', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    requester_id: { type: DataTypes.UUID, allowNull: false },
    receiver_id: { type: DataTypes.UUID, allowNull: false },
    status: { type: DataTypes.STRING(20), defaultValue: 'PENDING' },
    message: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    responded_at: { type: DataTypes.DATE },
  }, {
    tableName: 'friend_requests',
    timestamps: false,
    indexes: [
      // 같은 (requester, receiver) 쌍이 동시에 두 번 PENDING 요청을 만드는 걸 DB 레벨에서 막습니다.
      // status를 포함시켜서, 거절(DECLINED) 이후 다시 신청하는 정상 흐름은 막지 않습니다.
      { unique: true, fields: ['requester_id', 'receiver_id', 'status'] },
    ],
  });

  FriendRequest.associate = (models) => {
    FriendRequest.belongsTo(models.User, { as: 'Requester', foreignKey: 'requester_id', targetKey: 'uuid' });
    FriendRequest.belongsTo(models.User, { as: 'Receiver', foreignKey: 'receiver_id', targetKey: 'uuid' });
  };

  return FriendRequest;
};
