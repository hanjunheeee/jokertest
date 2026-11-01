// 끊김 유예 파일
// 끊긴 참가자 유예 시작·취소·만료 (만료면 이탈 반영은 주입받은 함수로), 끊김 처리·밤 턴·낮 타이머·재접속이 씀
const gameSessionCore = require('../../../game-core/gameSession')
const { getOrCreate, deleteNested } = require('../../common/maps')
const { nightTurnRuns, disconnectGraceRuns, phaseHooks } = require('../core/state')
const { pickTimerFns, clearRunTimer } = require('../core/timers')
const { isUuidConnected } = require('./ownership')

// 그 사람 끊김 유예 run (없으면 undefined)
function getDisconnectGraceRun(gameId, uuid) {
    return disconnectGraceRuns.get(gameId)?.get(uuid)
}

// 유예 run 떼기: 타이머 끄고 보관함에서 지움 (판에 남은 유예 없으면 판 칸도 지움)
function detachDisconnectGraceRun(gameId, uuid, run) {
    clearRunTimer(run)
    deleteNested(disconnectGraceRuns, gameId, uuid)
}

// 그 판의 유예 run 전부 떼기 (판 끝·시험 초기화)
function detachAllDisconnectGraces(gameId) {
    for (const [uuid, run] of [...(disconnectGraceRuns.get(gameId) ?? [])]) {
        detachDisconnectGraceRun(gameId, uuid, run)
    }
}

// 끊김 유예 시작: 내 밤 턴이면 그 턴 마감까지, 아니면 끊긴 단계가 바뀔 때 만료 (지도 08-⑤⑥)
function beginDisconnectGrace(io, session, uuid, deps = {}) {
    const existing = getDisconnectGraceRun(session.id, uuid)
    if (existing) return existing

    const nightRun = nightTurnRuns.get(session.id)
    const currentRole = gameSessionCore.getCurrentNightTurnRole(session)
    const playerRole = session.players.get(uuid)?.role
    const isOwnNightTurn =
        session.phase === 'NIGHT' &&
        currentRole !== null &&
        currentRole === playerRole &&
        nightRun?.deadline !== null &&
        nightRun?.deadline !== undefined

    // 시계는 시험이 넣은 것 → 밤 run 시계 → 진짜 시계 순서 (밤 턴 마감이랑 같은 시계로 셈)
    const run = {
        io,
        session,
        uuid,
        timerId: null,
        phaseAtDisconnect: session.phase,
        deadline: isOwnNightTurn ? nightRun.deadline : null,
        ...pickTimerFns(deps, nightRun?.nowFn ?? Date.now),
    }
    getOrCreate(disconnectGraceRuns, session.id, () => new Map()).set(uuid, run)
    if (isOwnNightTurn) {
        const remainingMs = Math.max(0, run.deadline - run.nowFn())
        run.timerId = run.setTimeoutFn(() => expireDisconnectGrace(run), remainingMs)
    }
    return run
}

// 단계가 바뀌었으면 끊긴 단계 유예는 전부 만료 (단계 경계마다 부름, 지도 08-⑥)
function expireDisconnectGracesAtPhaseBoundary(session) {
    const pending = disconnectGraceRuns.get(session.id)
    if (!pending) return
    for (const run of [...pending.values()]) {
        if (run.phaseAtDisconnect === session.phase) continue
        expireDisconnectGrace(run)
    }
}

// 다시 붙었으면 유예 풂, 풀었으면 true
function cancelDisconnectGrace(gameId, uuid) {
    const run = getDisconnectGraceRun(gameId, uuid)
    if (!run) return false
    detachDisconnectGraceRun(gameId, uuid, run)
    return true
}

// 유예 만료: 아직 그 run이고 안 붙었고 유예 대상 그대로면 이탈 처리
function expireDisconnectGrace(run) {
    const { io, session, uuid } = run
    if (getDisconnectGraceRun(session.id, uuid) !== run) return
    detachDisconnectGraceRun(session.id, uuid, run)

    if (isUuidConnected(io, uuid)) return
    const target = gameSessionCore.getDisconnectGraceTarget(uuid, session.id)
    if (!target || target.session !== session) return

    // 이탈 반영은 departure/apply 것을 주입받아 부름 (require 고리 막기)
    phaseHooks.applyParticipantDeparture(io, session, uuid, { reason: 'DISCONNECT_GRACE_EXPIRED' })
}

module.exports = {
    getDisconnectGraceRun,
    detachAllDisconnectGraces,
    beginDisconnectGrace,
    expireDisconnectGracesAtPhaseBoundary,
    cancelDisconnectGrace,
    expireDisconnectGrace,
}
