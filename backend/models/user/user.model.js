// 핵심 유저 모델 정의
/**
 * @desc    서비스의 가장 중심이 되는 회원(User) 계정 정보를 관리하는 모델입니다.
 * 인증(로그인), 보안(잠금 처리), 프로필 정보 및 회원 탈퇴(소프트 딜리트) 기능을 포함하며,
 * 서비스 내 거의 모든 다른 테이블(친구, 세션, 로그 등)과 관계를 맺는 핵심 뼈대입니다.
 * @param   {Object} sequelize - 데이터베이스 연결 객체
 * @param   {Object} DataTypes - 컬럼의 데이터 타입을 정의하는 객체
 * @returns {Object} User 모델
 */
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    uuid: {
      type: DataTypes.UUID, 
      defaultValue: DataTypes.UUIDV4, 
      primaryKey: true, // 보안 및 분산 환경을 고려해 순차적 ID 대신 예측 불가능한 UUID를 기본키로 사용
    },
    login_id: { type: DataTypes.STRING(50), allowNull: false, unique: true }, // 로그인에 사용할 아이디 (중복 불가)
    password_hash: { type: DataTypes.STRING(255), allowNull: false },         // 단방향 암호화(해싱)된 비밀번호
    nickname: { type: DataTypes.STRING(50), allowNull: false },               // 서비스 내에서 보여질 닉네임
    email: { type: DataTypes.STRING(100), allowNull: false, unique: true },   // 알림 및 계정 찾기용 이메일 (중복 불가)
    phone: { type: DataTypes.STRING(20) },                                    // 연락처 (선택)
    role: { type: DataTypes.STRING(20), defaultValue: 'USER' },               // 권한 (예: USER, ADMIN)
    status: { type: DataTypes.STRING(20), defaultValue: 'ACTIVE' },           // 계정 상태 (예: ACTIVE, BANNED)
    profile_image_url: { type: DataTypes.TEXT },                              // 프로필 사진 이미지 경로 또는 URL
    email_verified: { type: DataTypes.BOOLEAN, defaultValue: false },         // 이메일 본인 인증 완료 여부
    failed_login_count: { type: DataTypes.INTEGER, defaultValue: 0 },         // 로그인 연속 실패 횟수 (어뷰징 방지용)
    locked_until: { type: DataTypes.DATE },                                   // 계정 잠금 해제 일시 (실패 횟수 초과 시 세팅됨)
    last_login_at: { type: DataTypes.DATE },                                  // 마지막 접속 일시
    birth_date: { type: DataTypes.DATE },                                     // 생년월일
  }, {
    tableName: 'users', // 실제 DB에 생성될 테이블 이름
    timestamps: true,   // Sequelize가 데이터 생성(created_at) 및 수정(updated_at) 시간을 자동 관리
    paranoid: true,     // 핵심: 데이터 삭제 시 실제 DB에서 날리지 않고 삭제 시간(deleted_at)만 기록하는 소프트 딜리트 활성화 (탈퇴 유저 복구용)
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  });

  // 모델 간의 관계(Associations) 정의
  /**
   * 핵심 포인트: User 모델은 시스템의 중심이므로 수많은 테이블과 관계를 가집니다.
   * - hasMany: 한 명의 유저가 여러 개의 기록을 가질 수 있는 1:N 관계
   * - hasOne: 한 명의 유저가 딱 하나의 기록만 가지는 1:1 관계
   */
  User.associate = (models) => {
    // 1. 일반적인 1:N 관계들 (유저 1명 : 기록 N개)
    User.hasMany(models.UserBan, { foreignKey: 'user_id', sourceKey: 'uuid' });             // 정지 내역
    User.hasMany(models.LoginHistory, { foreignKey: 'user_id', sourceKey: 'uuid' });        // 로그인 히스토리
    User.hasMany(models.PasswordResetToken, { foreignKey: 'user_id', sourceKey: 'uuid' });  // 비밀번호 재설정 토큰
    User.hasMany(models.UserSession, { foreignKey: 'user_id', sourceKey: 'uuid' });         // 접속 세션 (다중 기기 접속 허용 시 N개)

    // 2. 소셜 기능 양방향 1:N 관계 (친구 테이블 쪽에서 헷갈리지 않게 as 별칭으로 구분)
    User.hasMany(models.FriendRequest, { as: 'SentRequests', foreignKey: 'requester_id', sourceKey: 'uuid' });     // 내가 보낸 친구 요청들
    User.hasMany(models.FriendRequest, { as: 'ReceivedRequests', foreignKey: 'receiver_id', sourceKey: 'uuid' });  // 내가 받은 친구 요청들
  
    User.hasMany(models.Friendship, { as: 'Friendships1', foreignKey: 'requester_id', sourceKey: 'uuid' });        // 내가 요청해서 성사된 찐친 관계들
    User.hasMany(models.Friendship, { as: 'Friendships2', foreignKey: 'receiver_id', sourceKey: 'uuid' });         // 내가 수락해서 성사된 찐친 관계들
  
    // 3. 1:1 관계 (유저 1명 : 상태 1개)
    User.hasOne(models.OnlinePresence, { foreignKey: 'user_id', sourceKey: 'uuid' });       // 현재 접속 및 활동 상태
  };

  return User;
};