// 게임 카테고리 입구, 직업 통계·전적 저장·판 업적 손잡이 이름 모아서 내보냄
// 시험 손잡이(__)는 하위 입구에서만, 부를 땐 ./roleStatistics · ./record · ./achievementHooks 사용
const roleStatistics = require('./roleStatistics')
const { persistTerminalSession, setEmitToUser } = require('./record')
const { recordDayVoteParticipation, evaluateAchievementsForUsers } = require('./achievementHooks')

module.exports = {
    ...roleStatistics,
    persistTerminalSession,
    setEmitToUser,
    recordDayVoteParticipation,
    evaluateAchievementsForUsers,
}
