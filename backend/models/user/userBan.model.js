// 계정 정지 표(user_bans) 모델, 정지 이유·기간 (한 계정에 여러 줄)
// models/index.js가 읽음, 로그인 보호 저장소가 지금 정지 중인지 읽기만 함
module.exports = (sequelize, DataTypes) => {
  const UserBan = sequelize.define('UserBan', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    // 정지된 사람한테 그대로 보여 줌
    reason: { type: DataTypes.TEXT },
    // 정지한 사람 칸, 정수라 계정 uuid는 못 담음
    banned_by: { type: DataTypes.INTEGER },
    // 영구 정지거나 end_at이 아직 안 지났으면 정지 중
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
