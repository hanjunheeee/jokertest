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
