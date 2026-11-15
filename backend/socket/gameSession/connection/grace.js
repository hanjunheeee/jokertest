// 끊김 유예 파일
// 끊긴 산 사람마다 60초 타이머 하나 시작·취소·만료(만료면 이탈 반영은 주입받은 함수로), 끊김 처리·재접속·낮 타이머·이탈 반영·판 끝 정리가 씀
const gameSessionCore = require('../../../game-core/gameSession')
const { getOrCreate, deleteNested } = require('../../common/maps')
const { DISCONNECT_GRACE_MS } = require('../core/constants')
const { disconnectGraceRuns, phaseHooks } = require('../core/state')
const { pickTimerFns, setRunTimer, clearRunTimer } = require('../core/timers')
const { isUuidConnected } = require('./ownership')

// 그 사람 끊김 유예 run (없으면 undefined)
function getDisconnectGraceRun(gameId, uuid) {
    return disconnectGraceRuns.get(gameId)?.get(uuid)
}

// 유예 run 떼기: 타이머 끄고 보관함에서 지움 (판에 남은 유예 없으면 판 칸도 지움)
function detachGraceRun(gameId, uuid, run) {
    clearRunTimer(run)
    deleteNested(disconnectGraceRuns, gameId, uuid)
}

// 그 판의 유예 run 전부 떼기 (판 끝·시험 초기화)
function detachAllGraces(gameId) {
    for (const [uuid, run] of [...(disconnectGraceRuns.get(gameId) ?? [])]) {
        detachGraceRun(gameId, uuid, run)
    }
}

// 끊김 유예 시작: 끊긴 때부터 60초 타이머 하나, 단계가 바뀌어도 그대로 (사용자 결정 2026-11-16)
// 기다리는 동안은 산 사람으로 침 (투표·밤 차례는 마감 때 기권·건너뜀, 피고면 재판 그대로)
function beginDisconnectGrace(io, session, uuid, deps = {}) {
    // 이미 유예 중이면 그대로 (처음 끊긴 때부터 셈)
    const existing = getDisconnectGraceRun(session.id, uuid)
    if (existing) return existing

    // 시계·타이머는 시험이 넣은 것 먼저, 없으면 진짜 것
    const run = {
        io,
        session,
        uuid,
        timerId: null,
        ...pickTimerFns(deps),
    }
    run.deadline = run.nowFn() + (Number.isInteger(deps.graceMs) && deps.graceMs >= 0 ? deps.graceMs : DISCONNECT_GRACE_MS)
    // 여기부터 진짜 바뀜: 유예 등록, 마감에 만료 타이머
    getOrCreate(disconnectGraceRuns, session.id, () => new Map()).set(uuid, run)
    setRunTimer(run, () => expireDisconnectGrace(run), Math.max(0, run.deadline - run.nowFn()))
    return run
}

// 판이 끝났으면 남은 유예 타이머 전부 뗌 (승부 난 뒤 결과 화면 동안 늦게 돌 일 없게, 단계 맞춤·낮 타이머·밤 시작이 부름)
function detachGracesIfEnded(session) {
    if (!session || session.phase !== 'ENDED') return
    detachAllGraces(session.id)
}

// 다시 붙었으면 유예 풂, 풀었으면 true
function cancelDisconnectGrace(gameId, uuid) {
    const run = getDisconnectGraceRun(gameId, uuid)
    if (!run) return false
    detachGraceRun(gameId, uuid, run)
    return true
}

// 유예 만료: 아직 그 run이고 안 붙었고 유예 대상 그대로면 이탈 처리
function expireDisconnectGrace(run) {
    const { io, session, uuid } = run
    // 옛 run이면 무시 (이미 풀렸거나 새 유예로 바뀜), 맞으면 먼저 뗌
    if (getDisconnectGraceRun(session.id, uuid) !== run) return
    detachGraceRun(session.id, uuid, run)

    // 그사이 다시 붙었거나 이미 죽음·기권·판 끝·다른 판이면 이탈 안 함
    if (isUuidConnected(io, uuid)) return
    const target = gameSessionCore.getDisconnectGraceTarget(uuid, session.id)
    if (!target || target.session !== session) return

    // 이탈 반영은 departure/apply 것을 주입받아 부름 (require 고리 막기)
    phaseHooks.applyParticipantDeparture(io, session, uuid, { reason: 'DISCONNECT_GRACE_EXPIRED' })
}

module.exports = {
    getDisconnectGraceRun,
    detachAllGraces,
    beginDisconnectGrace,
    detachGracesIfEnded,
    cancelDisconnectGrace,
    expireDisconnectGrace,
}
