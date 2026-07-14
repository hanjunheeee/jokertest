module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    uuid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    nickname: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    email: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    phone: { type: DataTypes.STRING(20) },
    role: { type: DataTypes.STRING(20), defaultValue: 'USER' },
    status: { type: DataTypes.STRING(20), defaultValue: 'ACTIVE' },
    profile_image_url: { type: DataTypes.TEXT },
    email_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
    failed_login_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    locked_until: { type: DataTypes.DATE },
    last_login_at: { type: DataTypes.DATE },
    birth_date: { type: DataTypes.DATE },
  }, {
    tableName: 'users',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  });

  User.associate = (models) => {
    User.hasMany(models.UserBan, { foreignKey: 'user_id', sourceKey: 'uuid' });
    User.hasMany(models.LoginHistory, { foreignKey: 'user_id', sourceKey: 'uuid' });
    User.hasMany(models.PasswordResetToken, { foreignKey: 'user_id', sourceKey: 'uuid' });
    User.hasMany(models.UserSession, { foreignKey: 'user_id', sourceKey: 'uuid' });

    User.hasMany(models.FriendRequest, { as: 'SentRequests', foreignKey: 'requester_id', sourceKey: 'uuid' });
    User.hasMany(models.FriendRequest, { as: 'ReceivedRequests', foreignKey: 'receiver_id', sourceKey: 'uuid' });

    User.hasMany(models.Friendship, { as: 'Friendships1', foreignKey: 'requester_id', sourceKey: 'uuid' });
    User.hasMany(models.Friendship, { as: 'Friendships2', foreignKey: 'receiver_id', sourceKey: 'uuid' });

    User.hasOne(models.OnlinePresence, { foreignKey: 'user_id', sourceKey: 'uuid' });
    User.hasOne(models.UserStats, { foreignKey: 'user_id', sourceKey: 'uuid' });
  };

  return User;
};
