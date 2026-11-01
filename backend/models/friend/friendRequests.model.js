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
  });

  FriendRequest.associate = (models) => {
    FriendRequest.belongsTo(models.User, { as: 'Requester', foreignKey: 'requester_id', targetKey: 'uuid' });
    FriendRequest.belongsTo(models.User, { as: 'Receiver', foreignKey: 'receiver_id', targetKey: 'uuid' });
  };

  return FriendRequest;
};
