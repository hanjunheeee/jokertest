// 판 끝 전적 저장 입구, 저장 시작·전송 함수 넣기·시험 손잡이 모아 내보냄
// socket/gameSession.js·socket/gameSession/departure/apply.js·end.js·handlers/register.js가 부름
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
