// 친구 관계 표(friendships) 모델, 친구 된 두 사람 한 줄 (수락할 때 반대 방향 줄이 없을 때만 만듦)
// models/index.js가 읽음, 친구 관계·친구 신청 저장소가 씀
module.exports = (sequelize, DataTypes) => {
  const Friendship = sequelize.define('Friendship', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // 신청한 사람·받은 사람 그대로, 찾을 땐 양쪽 다 봄
    requester_id: { type: DataTypes.UUID, allowNull: false },
    receiver_id: { type: DataTypes.UUID, allowNull: false },
    // 만들 때 늘 ACCEPTED
    status: { type: DataTypes.STRING(20), defaultValue: 'ACCEPTED' },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'friendships',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['requester_id', 'receiver_id'] },
    ],
  });

  // Friend1 = 신청한 쪽, Friend2 = 받은 쪽
  Friendship.associate = (models) => {
    Friendship.belongsTo(models.User, { as: 'Friend1', foreignKey: 'requester_id', targetKey: 'uuid' });
    Friendship.belongsTo(models.User, { as: 'Friend2', foreignKey: 'receiver_id', targetKey: 'uuid' });
  };

  return Friendship;
};
