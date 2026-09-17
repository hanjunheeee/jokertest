// F-19(AC-04/AC-05) 차단 원본.
//
// 차단은 **방향이 있는** 관계다: owner_id가 blocked_id를 차단했다는 사실 하나를 한 행이
// 나타낸다. 그래서 A가 B를 차단해도 B는 A를 차단하지 않은 상태이고, 해제 권한은 owner에게만
// 있다(friend.service.js::unblockUser의 WHERE에 인증 owner를 강제한다).
//
// 기존 Friendship과 **분리**해 저장하는 이유가 AC-05의 핵심이다: 차단은 친구 관계 행을
// 지우지 않는다. 차단 중에는 목록·초대 후보에서 상대를 제외하지만, 해제하면 원래 친구
// 관계가 그대로 다시 보인다. 반대로 차단 시점에 무효화된 PENDING 요청·초대는 CANCELLED로
// 확정되고 해제만으로 되살아나지 않는다.
//
// "제한"의 범위는 친구 신청과 게임 초대 두 가지뿐이다. 진행 중인 게임의 필수 수신
// (emitToUser 기반 게임 채널·투표·능력·밤 영상)에는 이 관계를 적용하지 않는다 — 그렇게
// 하면 차단 하나로 같은 판의 다른 참가자를 게임에서 실질적으로 밀어낼 수 있게 된다.
module.exports = (sequelize, DataTypes) => {
  const FriendBlock = sequelize.define('FriendBlock', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // 차단을 소유한(=해제할 수 있는) 계정. 인증 uuid만 들어간다.
    owner_id: { type: DataTypes.UUID, allowNull: false },
    blocked_id: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'friend_blocks',
    timestamps: false,
    indexes: [
      { unique: true, name: 'friend_blocks_owner_blocked_unique', fields: ['owner_id', 'blocked_id'] },
      // "나를 차단한 사람"을 찾는 역방향 조회(양방향 거부 판정)의 경로다.
      { name: 'friend_blocks_blocked_idx', fields: ['blocked_id'] },
    ],
  });

  FriendBlock.associate = (models) => {
    FriendBlock.belongsTo(models.User, { as: 'BlockOwner', foreignKey: 'owner_id', targetKey: 'uuid' });
    FriendBlock.belongsTo(models.User, { as: 'BlockedUser', foreignKey: 'blocked_id', targetKey: 'uuid' });
  };

  return FriendBlock;
};
