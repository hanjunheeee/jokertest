module.exports = (sequelize, DataTypes) => {
  const FriendBlock = sequelize.define('FriendBlock', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    owner_id: { type: DataTypes.UUID, allowNull: false },
    blocked_id: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'friend_blocks',
    timestamps: false,
    indexes: [
      { unique: true, name: 'friend_blocks_owner_blocked_unique', fields: ['owner_id', 'blocked_id'] },
      { name: 'friend_blocks_blocked_idx', fields: ['blocked_id'] },
    ],
  });

  FriendBlock.associate = (models) => {
    FriendBlock.belongsTo(models.User, { as: 'BlockOwner', foreignKey: 'owner_id', targetKey: 'uuid' });
    FriendBlock.belongsTo(models.User, { as: 'BlockedUser', foreignKey: 'blocked_id', targetKey: 'uuid' });
  };

  return FriendBlock;
};
