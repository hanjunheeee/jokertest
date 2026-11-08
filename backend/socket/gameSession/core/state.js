// 판마다 run 보관함 파일
// 밤 턴·낮·역할 공개·재판·끊김 유예 run + 이탈 판정 표식·밤 마무리 중 표시 + 위층 함수 주입 자리, 타이머·이탈·핸들러가 같이 씀

// 판 id → 밤 턴 run (밤마다 하나)
const nightTurnRuns = new Map()

// 판 id → 낮 타이머 run
const dayPhaseRuns = new Map()

// 판 id → 역할 공개 마감 run (안 누른 사람 있어도 마감 때 첫 낮으로)
const roleRevealRuns = new Map()

// 판 id → 재판 마감 run (안 낸 사람 기권 채우고 판정)
const tribunalRuns = new Map()

// 판 id → uuid → 끊김 유예 run
const disconnectGraceRuns = new Map()

// 판 id → 이탈 뒤 바로 판정할 자리 표식 (낮 투표 라운드·재판 후보 좌표)
const departureResolveMarks = new Map()

// 판 id → 끝난 판 끊긴 사람 정리 예약 (판 끝 뒤 안 돌아온 사람 때문에 판이 장부에 남지 않게)
const endedSweepRuns = new Map()

// 밤 마무리 중인 판 id (같은 밤 두 번 확정 막기)
const nightFinalizeInFlight = new Set()

// 아래 파일이 위 파일 함수를 부를 자리 (require 고리 막기, 입구 gameSession.js가 불러올 때 채움)
// 끊김 유예 만료 → 이탈 반영, 밤 턴 다 돎 → 밤 마무리, 연출 대기 풂 → 다음 밤 턴, 재판 마감 → 재판 판정
const phaseHooks = {
    applyParticipantDeparture: null,
    finalizeNightForSession: null,
    advanceNightTurn: null,
    resolveTribunalNow: null,
}

// 주입 자리 채우기 (넘긴 이름만 바꿈)
function setPhaseHooks(hooks) {
    Object.assign(phaseHooks, hooks)
}

module.exports = {
    nightTurnRuns,
    dayPhaseRuns,
    roleRevealRuns,
    tribunalRuns,
    disconnectGraceRuns,
    departureResolveMarks,
    endedSweepRuns,
    nightFinalizeInFlight,
    phaseHooks,
    setPhaseHooks,
}
