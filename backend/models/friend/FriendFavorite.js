// F-19(AC-03) 즐겨찾기 원본.
//
// 한 행이 "이 계정이 이 친구를 즐겨찾기로 표시했다"는 사실 하나다. 소유 계정(owner_id)이
// 유일 키에 함께 들어가므로 서로 다른 계정이 같은 친구를 즐겨찾기해도 충돌하지 않고,
// 반대로 같은 계정이 같은 친구를 두 번 저장할 수는 없다 — 저장은 toggle 명령이 아니라
// "원하는 true/false"를 반복 저장하는 멱등 계약이라(friend.service.js::setFriendFavorite)
// 응답이 유실돼 재전송돼도 행이 늘어나지 않는다.
//
// 차단(FriendBlock)이나 친구 관계(Friendship)와 달리 즐겨찾기는 상대에게 아무것도 알리지
// 않는 소유자 전용 표시다. 그래서 상대 계정의 조회 경로에는 이 테이블이 등장하지 않는다.
module.exports = (sequelize, DataTypes) => {
  const FriendFavorite = sequelize.define('FriendFavorite', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // 인증 미들웨어가 확정한 uuid만 들어간다. 요청 본문의 값은 쓰지 않는다.
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
