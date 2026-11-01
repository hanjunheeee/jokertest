// 계정 표(users) 모델, 로그인 정보·프로필·로그인 잠금 상태
// models/index.js가 읽음, 계정·친구·초대·프로필 저장소가 db.User로 씀
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    // 계정 id, 다른 표가 전부 이 uuid로 가리킴
    uuid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    // bcrypt 해시 (소셜 전용 계정은 아무도 모르는 임의 값의 해시)
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    nickname: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    email: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    phone: { type: DataTypes.STRING(20) },
    // 토큰에 실어 보냄, 지금은 늘 USER
    role: { type: DataTypes.STRING(20), defaultValue: 'USER' },
    // ACTIVE가 아니면 친구 신청·초대·검색에서 빠짐
    status: { type: DataTypes.STRING(20), defaultValue: 'ACTIVE' },
    profile_image_url: { type: DataTypes.TEXT },
    // 가입 경로가 확인된 이메일만 받아서 일반·소셜 가입 둘 다 true로 넣음
    email_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
    // 비번 5번 틀리면 15분 잠금 (성공하면 둘 다 처음으로)
    failed_login_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    locked_until: { type: DataTypes.DATE },
    last_login_at: { type: DataTypes.DATE },
    // 아이디 찾기 때 닉네임과 같이 맞춰 봄
    birth_date: { type: DataTypes.DATE },
    // false면 소셜 전용 계정, 비번 재설정 대신 소셜 로그인 안내 메일
    has_local_password: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    tableName: 'users',
    timestamps: true,
    // 지우면 deleted_at만 채우는 방식 (행은 남음)
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  });

  // 계정 하나에 딸린 표들 (전부 user_id·requester_id 같은 칸으로 uuid를 가리킴)
  User.associate = (models) => {
    User.hasMany(models.UserBan, { foreignKey: 'user_id', sourceKey: 'uuid' });
    User.hasMany(models.LoginHistory, { foreignKey: 'user_id', sourceKey: 'uuid' });
    User.hasMany(models.PasswordResetToken, { foreignKey: 'user_id', sourceKey: 'uuid' });
    User.hasMany(models.UserSession, { foreignKey: 'user_id', sourceKey: 'uuid' });
    User.hasMany(models.ExternalIdentity, { foreignKey: 'user_id', sourceKey: 'uuid' });

    // 친구 신청은 보낸 쪽·받은 쪽 두 갈래
    User.hasMany(models.FriendRequest, { as: 'SentRequests', foreignKey: 'requester_id', sourceKey: 'uuid' });
    User.hasMany(models.FriendRequest, { as: 'ReceivedRequests', foreignKey: 'receiver_id', sourceKey: 'uuid' });

    // 친구 관계도 신청한 쪽·받은 쪽 두 갈래
    User.hasMany(models.Friendship, { as: 'Friendships1', foreignKey: 'requester_id', sourceKey: 'uuid' });
    User.hasMany(models.Friendship, { as: 'Friendships2', foreignKey: 'receiver_id', sourceKey: 'uuid' });

    User.hasMany(models.GameResultPlayer, { foreignKey: 'user_id', sourceKey: 'uuid' });

    // 접속 상태·통계는 계정마다 한 줄
    User.hasOne(models.OnlinePresence, { foreignKey: 'user_id', sourceKey: 'uuid' });
    User.hasOne(models.UserStats, { foreignKey: 'user_id', sourceKey: 'uuid' });
  };

  return User;
};
