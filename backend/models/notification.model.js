// F-17 알림 원본. 한 행이 "한 계정에게 한 원본 사건이 알려졌다"는 사실 하나다(A-01).
// (user_id, source_key) 복합 유일 인덱스가 동시 저장·재시도·재전달에서도 같은 사건이
// 두 번 쌓이지 않는 근거다(AC-03) — 컬럼 정의는
// backend/db/migrations/0012-add-notifications.js와 항상 같은 모양이어야 한다.
//
// backend/models/index.js의 재귀 로더가 이 파일을 읽어 db.Notification으로 등록한다.
module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define('Notification', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.STRING(40), allowNull: false },
    source_key: { type: DataTypes.STRING(120), allowNull: false },
    title: { type: DataTypes.STRING(120), allowNull: false },
    body: { type: DataTypes.STRING(500), allowNull: false },
    target: { type: DataTypes.JSON, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
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
