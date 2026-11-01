module.exports = (sequelize, DataTypes) => {
  const FriendFavorite = sequelize.define('FriendFavorite', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
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
