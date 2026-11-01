// 접속 상태 표(online_presence) 모델, 계정마다 지금 상태·마지막 활동 시각 한 줄
// models/index.js가 읽음, 접속 상태 저장소가 친구 목록·접속 알림 때 씀
module.exports = (sequelize, DataTypes) => {
  const OnlinePresence = sequelize.define('OnlinePresence', {
    user_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    status: { type: DataTypes.STRING(20), defaultValue: 'ONLINE' },
    // 상태 저장할 때마다 지금으로
    last_active_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    // 값을 넣는 곳 없음 (정수라 uuid 방 id도 못 담음)
    current_room_id: { type: DataTypes.INTEGER },
  }, {
    tableName: 'online_presence',
    timestamps: false,
  });

  OnlinePresence.associate = (models) => {
    OnlinePresence.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return OnlinePresence;
};
