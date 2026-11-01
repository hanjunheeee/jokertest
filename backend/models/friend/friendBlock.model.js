// 차단 표(friend_blocks) 모델, 내가 막은 사람 한 줄씩 (한쪽 방향)
// models/index.js가 읽음, 차단·즐겨찾기 저장소가 씀
module.exports = (sequelize, DataTypes) => {
  const FriendBlock = sequelize.define('FriendBlock', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // 막은 사람 → 막힌 사람
    owner_id: { type: DataTypes.UUID, allowNull: false },
    blocked_id: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'friend_blocks',
    timestamps: false,
    // 같은 짝 두 줄 막기 + 나를 막은 사람 찾기용 색인
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
