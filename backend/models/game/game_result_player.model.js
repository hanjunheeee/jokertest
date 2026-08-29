module.exports = (sequelize, DataTypes) => {
  const GameResultPlayer = sequelize.define('GameResultPlayer', {
    game_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      references: { model: 'game_results', key: 'id' },
    },
    user_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      references: { model: 'users', key: 'uuid' },
    },
    nickname_snapshot: { type: DataTypes.STRING(30), allowNull: false },
    role: { type: DataTypes.STRING(20), allowNull: false },
    team: { type: DataTypes.STRING(20), allowNull: false },
    won: { type: DataTypes.BOOLEAN, allowNull: true },
    is_alive: { type: DataTypes.BOOLEAN, allowNull: false },
    death_reason: { type: DataTypes.STRING(20), allowNull: true },
  }, {
    tableName: 'game_result_players',
    timestamps: false,
  });

  GameResultPlayer.associate = (models) => {
    GameResultPlayer.belongsTo(models.GameResult, { foreignKey: 'game_id', targetKey: 'id' });
    GameResultPlayer.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return GameResultPlayer;
};
