// 판 끝 전적 저장 입구, 옛 gameRecord.service와 같은 이름만 골라 내보냄
// socket gameSession이 이 입구로 부름 (시험 손잡이도 여기)
const { persistTerminalSession } = require('./persist')
const { setEmitToUser, __setTerminalPersistTimersForTests } = require('./deps')
const { __getTerminalPersistRunsForTests, __resetTerminalPersistForTests } = require('./testing')

module.exports = {
    persistTerminalSession,
    setEmitToUser,
    __setTerminalPersistTimersForTests,
    __getTerminalPersistRunsForTests,
    __resetTerminalPersistForTests,
}
