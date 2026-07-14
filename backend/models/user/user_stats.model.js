module.exports = (sequelize, DataTypes) => {
  const UserStats = sequelize.define('UserStats', {
    user_id: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    reputation: { type: DataTypes.INTEGER, defaultValue: 0 },
    title: { type: DataTypes.STRING(50), defaultValue: '신참' },
    total_games: { type: DataTypes.INTEGER, defaultValue: 0 },
    survival_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    execution_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    most_played_role: { type: DataTypes.STRING(50), allowNull: true },
  }, {
    tableName: 'user_stats',
    timestamps: false,
  });

  UserStats.associate = (models) => {
    UserStats.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return UserStats;
};
