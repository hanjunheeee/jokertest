// 알림 표(notifications) 모델, 사람마다 받은 알림 한 줄씩 + 읽은 시각
// models/index.js가 읽음, 알림 저장소가 만들기·목록·읽음·지우기에 씀
module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define('Notification', {
    // 서비스가 만든 uuid
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.STRING(40), allowNull: false },
    // 무슨 일로 생긴 알림인지 키, 같은 사람·같은 키는 한 줄만 (두 번 알림 막기)
    source_key: { type: DataTypes.STRING(120), allowNull: false },
    title: { type: DataTypes.STRING(120), allowNull: false },
    body: { type: DataTypes.STRING(500), allowNull: false },
    // 무엇에 대한 알림인지 (종류 + 신청·초대·업적 id), 없을 수 있음
    target: { type: DataTypes.JSON, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    // null이면 안 읽음
    read_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'notifications',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['user_id', 'source_key'], name: 'notifications_user_source_unique' },
      { fields: ['user_id', 'created_at'], name: 'notifications_user_created_idx' },
    ],
  });

  Notification.associate = (models) => {
    Notification.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return Notification;
};
