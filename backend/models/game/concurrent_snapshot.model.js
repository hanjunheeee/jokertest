module.exports = (sequelize, DataTypes) => {
  const ConcurrentSnapshot = sequelize.define('ConcurrentSnapshot', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    captured_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    online_users: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    playing_users: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    active_rooms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, {
    tableName: 'concurrent_snapshots',
    // 특정 시점의 집계를 한 줄씩 append하는 시계열 테이블이라 갱신 시각이 필요 없습니다.
    timestamps: false,
    indexes: [
      // 구간 조회(최근 N시간)가 유일한 읽기 패턴이라 수집 시각에 인덱스를 둡니다.
      { fields: ['captured_at'] },
    ],
  });

  ConcurrentSnapshot.associate = (models) => {
    // 특정 사용자·방에 종속되지 않는 독립 집계 테이블이라 외래키가 없습니다.
  };

  return ConcurrentSnapshot;
};
