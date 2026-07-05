/**
 * 유저 게임 통계 Sequelize 모델 (1:1 with users).
 *
 * 게임 플레이 기록과 평판 시스템 데이터를 별도 테이블로 분리합니다.
 * users 테이블에 직접 넣지 않는 이유: 게임 통계는 업데이트 빈도가 높아 분리 관리합니다.
 */
/**
 * @desc    유저의 게임 플레이 통계(전적, 평판, 칭호 등)를 관리하는 모델입니다.
 * @param   {Object} sequelize - 데이터베이스 연결 객체
 * @param   {Object} DataTypes - 컬럼의 데이터 타입을 정의하는 객체
 * @returns {Object} UserStats 모델
 */
module.exports = (sequelize, DataTypes) => {
  const UserStats = sequelize.define('UserStats', {
    user_id: {
      type:       DataTypes.UUID,
      primaryKey: true, // 통계 소유자의 유저 UUID (기본키이자 User 테이블을 가리키는 외래키 역할, 1:1 관계 형성)
    },
    reputation: {
      type:         DataTypes.INTEGER,
      defaultValue: 0, // 평판 점수 (게임 매너/신고 등에 따라 증감되는 누적 점수)
    },
    title: {
      type:         DataTypes.STRING(50),
      defaultValue: '신참', // 평판 점수 등 조건에 따라 부여되는 칭호 (예: 신참, 숙련자 등)
    },
    total_games: {
      type:         DataTypes.INTEGER,
      defaultValue: 0, // 누적 총 게임 참여 횟수
    },
    survival_count: {
      type:         DataTypes.INTEGER,
      defaultValue: 0, // 게임에서 생존(승리)으로 종료한 횟수
    },
    execution_count: {
      type:         DataTypes.INTEGER,
      defaultValue: 0, // 게임에서 처형(패배 등)으로 종료한 횟수
    },
    most_played_role: {
      type:      DataTypes.STRING(50),
      allowNull: true, // 가장 많이 플레이한 역할군 (충분한 표본이 쌓이기 전에는 null일 수 있음)
    },
  }, {
    tableName:  'user_stats', // 실제 DB에 생성될 테이블 이름
    timestamps: false,        // 업데이트가 잦은 통계성 데이터라 생성/수정 시간 자동 관리 기능은 끔
  });

  // 모델 간의 관계(Associations) 정의
  UserStats.associate = (models) => {
    // 1:1 관계 설정: user_id가 기본키이자 외래키이므로 한 명의 유저는 하나의 통계 레코드만 가집니다.
    UserStats.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return UserStats;
};
