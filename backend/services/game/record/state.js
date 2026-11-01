// 전적 저장 상태 파일, 진행 중 저장 Map · 저장 확인 Set · 세션 표식 WeakMap
// persist.js·testing.js가 씀, 세션 표식은 초기화 때 새로 만드니 getBySession()으로 매번 읽음

// 아직 DB 커밋 확인 못 한 저장 작업 (gameId → run)
const terminalPersistRuns = new Map()

// 이 프로세스에서 저장 확인된 판 (오래된 것부터 버림)
const confirmedGameIds = new Set()

// session을 붙잡은 늦은 훅도 저장 다시 못 하게 (Set에서 밀려난 판 보완)
let sessionMarks = new WeakMap()

// 지금 세션 표식 꺼내기 (초기화 뒤에도 새 WeakMap 보이게)
function getBySession() {
    return sessionMarks
}

// 세션 표식 통째로 바꾸기 (시험 초기화가 부름)
function setBySession(next) {
    sessionMarks = next
}

module.exports = {
    terminalPersistRuns,
    confirmedGameIds,
    getBySession,
    setBySession,
}
