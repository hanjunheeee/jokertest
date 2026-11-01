module.exports = (sequelize, DataTypes) => {
  const Friendship = sequelize.define('Friendship', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    requester_id: { type: DataTypes.UUID, allowNull: false },
    receiver_id: { type: DataTypes.UUID, allowNull: false },
    status: { type: DataTypes.STRING(20), defaultValue: 'ACCEPTED' },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'friendships',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['requester_id', 'receiver_id'] },
    ],
  });

  Friendship.associate = (models) => {
    Friendship.belongsTo(models.User, { as: 'Friend1', foreignKey: 'requester_id', targetKey: 'uuid' });
    Friendship.belongsTo(models.User, { as: 'Friend2', foreignKey: 'receiver_id', targetKey: 'uuid' });
  };

  return Friendship;
};
