module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    uuid: {
      type: DataTypes.UUID, 
      defaultValue: DataTypes.UUIDV4, 
      primaryKey: true,
    },
    login_id: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    nickname: { type: DataTypes.STRING(50), allowNull: false },
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
    timestamps: true, // created_at, updated_at 자동 관리
    paranoid: true,   // deleted_at 자동 관리 (소프트 딜리트)
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  });

  User.associate = (models) => {
    // 유저 1 : N 관계들
    User.hasMany(models.UserBan, { foreignKey: 'user_id', sourceKey: 'uuid' });
    User.hasMany(models.LoginHistory, { foreignKey: 'user_id', sourceKey: 'uuid' });
    User.hasMany(models.PasswordResetToken, { foreignKey: 'user_id', sourceKey: 'uuid' });
    User.hasMany(models.UserSession, { foreignKey: 'user_id', sourceKey: 'uuid' });
  };

  return User;
};