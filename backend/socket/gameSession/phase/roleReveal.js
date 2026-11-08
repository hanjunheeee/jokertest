// 역할 공개 마감 타이머 파일
// 역할 공개 단계 마감 걸기·끄기 + 마감 때 첫 낮으로 넘기고 방송 (BE-002), 역할 확인 핸들러·끊김 처리·이탈 반영·판 끝 정리가 씀
const gameSessionCore = require('../../../game-core/gameSession')
const { isolateOr } = require('../../common/isolate')
const { ROLE_REVEAL_DEADLINE_MS } = require('../core/constants')
const { roleRevealRuns } = require('../core/state')
const { pickTimerFns, setRunTimer, clearRunTimer } = require('../core/timers')
const { emitToGameChannel } = require('../delivery/broadcast')
const { announceDayStep } = require('./day')

// 역할 공개 마감 걸기: 판마다 하나, 이미 걸렸으면 그대로 (처음 건 마감 유지)
// 판 시작 때 부름 (끊길 때도 부르지만 이미 걸려 있어 그대로), 사람 확인 안 기다리고 마감 때 무조건 첫 낮으로
function ensureRoleRevealTimer(io, session, deps = {}) {
    if (!session || session.phase !== 'ROLE_REVEAL') return null
    const existing = roleRevealRuns.get(session.id)
    if (existing && existing.session === session) return existing
    if (existing) stopRoleRevealTimer(session.id)

    const durationMs = Number.isInteger(deps.durationMs) && deps.durationMs > 0 ? deps.durationMs : ROLE_REVEAL_DEADLINE_MS
    const run = { io, session, timerId: null, deadline: null, ...pickTimerFns(deps) }
    run.deadline = run.nowFn() + durationMs
    roleRevealRuns.set(session.id, run)
    setRunTimer(run, () => expireRoleReveal(run), durationMs)
    return run
}

// 역할 공개 마감 끄기: 판 끝·시험 초기화
function stopRoleRevealTimer(gameId) {
    const run = roleRevealRuns.get(gameId)
    if (!run) return
    clearRunTimer(run)
    roleRevealRuns.delete(gameId)
}

// 역할 공개 마감: 아직 역할 공개면 첫 낮으로 + 낮 타이머(끊긴 사람 유예 만료 포함) + 단계 방송
function expireRoleReveal(run) {
    const { io, session } = run
    // 옛 run이면 무시 (다시 걸었거나 꺼짐), 맞으면 먼저 뗌
    if (roleRevealRuns.get(session.id) !== run) return
    run.timerId = null
    roleRevealRuns.delete(session.id)
    // 그사이 다 확인해 넘어갔으면 할 일 없음
    if (session.phase !== 'ROLE_REVEAL') return

    const forced = isolateOr(null, '[역할 공개 마감 처리 실패]', { code: 'TRANSITION_ERROR', gameId: session.id },
        () => gameSessionCore.forceCompleteRoleReveal(session))
    if (!forced?.ok || !forced.transitioned) return

    // 낮 타이머 먼저 (방송에 새 마감 시각 실으려고)
    announceDayStep(io, session, '[phase 변경 알림 전송 실패]', () =>
        emitToGameChannel(io, session, 'game_phase_changed', gameSessionCore.buildPhaseChangedPayload(session)))
}

module.exports = {
    ensureRoleRevealTimer,
    stopRoleRevealTimer,
}
