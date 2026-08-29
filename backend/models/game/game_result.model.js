module.exports = (sequelize, DataTypes) => {
  const GameResult = sequelize.define('GameResult', {
    id: { type: DataTypes.UUID, primaryKey: true },
    room_id: { type: DataTypes.UUID, allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: false },
    ended_at: { type: DataTypes.DATE, allowNull: false },
    winner: { type: DataTypes.STRING(20), allowNull: false },
    win_reason: { type: DataTypes.STRING(40), allowNull: true },
    day_index: { type: DataTypes.INTEGER, allowNull: false },
    player_count: { type: DataTypes.INTEGER, allowNull: false },
    settings: { type: DataTypes.JSON, allowNull: true },
    completed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    tableName: 'game_results',
    timestamps: false,
  });

  GameResult.associate = (models) => {
    GameResult.hasMany(models.GameResultPlayer, { foreignKey: 'game_id', sourceKey: 'id' });
  };

  return GameResult;
};
