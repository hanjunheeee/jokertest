module.exports = (sequelize, DataTypes) => {
  const UserBan = sequelize.define('UserBan', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    reason: { type: DataTypes.TEXT },
    banned_by: { type: DataTypes.INTEGER },
    is_permanent: { type: DataTypes.BOOLEAN, defaultValue: false },
    start_at: { type: DataTypes.DATE },
    end_at: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'user_bans',
    timestamps: false,
  });

  UserBan.associate = (models) => {
    UserBan.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return UserBan;
};
