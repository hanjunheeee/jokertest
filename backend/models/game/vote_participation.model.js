module.exports = (sequelize, DataTypes) => {
  const VoteParticipation = sequelize.define('VoteParticipation', {
    id: { type: DataTypes.BIGINT, primaryKey: true, allowNull: false, autoIncrement: true },
    game_id: { type: DataTypes.UUID, allowNull: false },
    day_index: { type: DataTypes.INTEGER, allowNull: false },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'uuid' },
    },
    accepted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'vote_participations',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['game_id', 'day_index', 'user_id'], name: 'vote_participations_game_day_user_unique' },
    ],
  });

  VoteParticipation.associate = (models) => {
    VoteParticipation.belongsTo(models.GameResult, { foreignKey: 'game_id', targetKey: 'id', constraints: false });
    VoteParticipation.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return VoteParticipation;
};
