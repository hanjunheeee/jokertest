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
