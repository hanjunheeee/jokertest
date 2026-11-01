// 동시 접속 기록 표(concurrent_snapshots) 모델, 찍은 시각마다 전체·로비·게임 중·방 수 한 줄
// models/index.js가 읽음, 동시 접속 저장소가 한 줄씩 쌓음 (읽는 코드 없음)
module.exports = (sequelize, DataTypes) => {
  const ConcurrentSnapshot = sequelize.define('ConcurrentSnapshot', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    captured_at: { type: DataTypes.DATE, allowNull: false },
    total: { type: DataTypes.INTEGER, allowNull: false },
    lobby: { type: DataTypes.INTEGER, allowNull: false },
    in_game: { type: DataTypes.INTEGER, allowNull: false },
    room_count: { type: DataTypes.INTEGER, allowNull: false },
  }, {
    tableName: 'concurrent_snapshots',
    timestamps: false,
    indexes: [{ fields: ['captured_at'] }],
  });

  return ConcurrentSnapshot;
};
