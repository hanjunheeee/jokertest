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
    // F-29b §2-3a: 소셜 전용 계정(로컬 비밀번호 없음) 판정. 기본값 true — 로컬 가입은 항상
    // true로 남고, 소셜 가입 완료(completeSocialSignup)만 명시적으로 false를 저장한다.
    // 명시적 연결(identity 추가)·비밀번호 변경·재설정 성공은 이 값을 건드리지 않는다.
    has_local_password: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
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
    // F-05: 한 계정에 여러 소셜 identity(구글/카카오 등)가 연결될 수 있다(AC-04 명시적 연결).
    User.hasMany(models.ExternalIdentity, { foreignKey: 'user_id', sourceKey: 'uuid' });

    User.hasMany(models.FriendRequest, { as: 'SentRequests', foreignKey: 'requester_id', sourceKey: 'uuid' });
    User.hasMany(models.FriendRequest, { as: 'ReceivedRequests', foreignKey: 'receiver_id', sourceKey: 'uuid' });

    User.hasMany(models.Friendship, { as: 'Friendships1', foreignKey: 'requester_id', sourceKey: 'uuid' });
    User.hasMany(models.Friendship, { as: 'Friendships2', foreignKey: 'receiver_id', sourceKey: 'uuid' });

    User.hasMany(models.GameResultPlayer, { foreignKey: 'user_id', sourceKey: 'uuid' });

    User.hasOne(models.OnlinePresence, { foreignKey: 'user_id', sourceKey: 'uuid' });
    User.hasOne(models.UserStats, { foreignKey: 'user_id', sourceKey: 'uuid' });
  };

  return User;
};
