module.exports = (sequelize, DataTypes) => {
  const PasswordResetToken = sequelize.define('PasswordResetToken', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    token: { type: DataTypes.STRING(255), allowNull: false },
    expired_at: { type: DataTypes.DATE, allowNull: false },
    used: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'password_reset_tokens',
    timestamps: false,
  });

  PasswordResetToken.associate = (models) => {
    PasswordResetToken.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return PasswordResetToken;
};
