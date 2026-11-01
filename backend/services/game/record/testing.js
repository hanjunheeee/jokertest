// 전적 저장 시험 손잡이 파일
// 진행 중 저장 보기 · 상태 전부 초기화
const { terminalPersistRuns, confirmedGameIds, setBySession } = require('./state')
const { clearPersistTimer } = require('./persist')
const { __setTerminalPersistTimersForTests } = require('./deps')

// 시험용: 진행 중 저장 작업 목록
function __getTerminalPersistRunsForTests() {
    return [...terminalPersistRuns.values()]
}

// 시험용 초기화: 재시도 타이머 끄고(지금 넣어 둔 clear 함수로) 보관함 비우고 타이머 원래대로
function __resetTerminalPersistForTests() {
    for (const run of [...terminalPersistRuns.values()]) clearPersistTimer(run)
    terminalPersistRuns.clear()
    confirmedGameIds.clear()
    setBySession(new WeakMap())
    __setTerminalPersistTimersForTests()
}

module.exports = {
    __getTerminalPersistRunsForTests,
    __resetTerminalPersistForTests,
}
