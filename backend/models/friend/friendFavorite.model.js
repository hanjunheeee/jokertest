// 친구 즐겨찾기 표(friend_favorites) 모델, 내가 즐겨찾기한 친구 한 줄씩 (한쪽 방향)
// models/index.js가 읽음, 차단·즐겨찾기 저장소가 켜고 끄고 읽음
module.exports = (sequelize, DataTypes) => {
  const FriendFavorite = sequelize.define('FriendFavorite', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // 표시한 사람 → 표시된 친구
    owner_id: { type: DataTypes.UUID, allowNull: false },
    friend_id: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'friend_favorites',
    timestamps: false,
    indexes: [
      { unique: true, name: 'friend_favorites_owner_friend_unique', fields: ['owner_id', 'friend_id'] },
    ],
  });

  FriendFavorite.associate = (models) => {
    FriendFavorite.belongsTo(models.User, { as: 'FavoriteOwner', foreignKey: 'owner_id', targetKey: 'uuid' });
    FriendFavorite.belongsTo(models.User, { as: 'FavoriteFriend', foreignKey: 'friend_id', targetKey: 'uuid' });
  };

  return FriendFavorite;
};
