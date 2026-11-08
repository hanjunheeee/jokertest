// 판 끝 정리 파일
// core가 판 지운 뒤 마무리(전적 저장·타이머·대기방·종료 방송·채널) + 승부 난 방송에 종료 필드·끊긴 사람 정리 예약
// 판 끝 마무리는 나가기·끊김, 종료 필드는 재판·밤·이탈 뒤 판정, 대기방 정리는 나가기가 씀
const gameSessionCore = require('../../../game-core/gameSession')
const matchmaking = require('../../matchmaking')
const { persistTerminalSession } = require('../../../services/game/record')
const { isolate, isolateOr, isolateWithError } = require('../../common/isolate')
const { ENDED_SWEEP_DELAY_MS } = require('../core/constants')
const { endedSweepRuns } = require('../core/state')
const { isUuidConnected } = require('../connection/ownership')
const { detachAllGraces } = require('../connection/grace')
const { buildSessionEndContext } = require('../delivery/eligibility')
const { detachFromGameChannel, emitToGameChannel } = require('../delivery/broadcast')
const { deleteNightReceipts } = require('../phase/night/receipts')
const { stopNightTurnSequence } = require('../phase/night/turn')
const { stopDayPhaseTimer } = require('../phase/day')
const { stopRoleRevealTimer } = require('../phase/roleReveal')
const { stopTribunalTimer } = require('../phase/tribunal')
const { clearDepartureMark } = require('./marks')

// 승부 났으면 방송 내용에 종료 필드(전원 정체) 덧붙이고 전적 저장 시작·끊긴 사람 정리 예약, 저장은 안 기다림 (지도 06-⑩ · 07-①⑧)
// 종료 필드 만들다 던지면 원래 내용 그대로, 원래 내용을 못 만들었으면 판 id·날짜는 붙여 보냄 (어느 판 종료인지 모르던 것)
function withTerminalFields(session, terminal, payload, label, fields, io = null) {
    if (!terminal) return payload
    let merged = payload
    isolate(label, { code: 'TERMINAL_BUILD_ERROR', ...fields }, () => {
        const terminalFields = gameSessionCore.buildTerminalFields(session)
        merged = payload
            ? { ...payload, ...terminalFields }
            : { gameId: session.id, dayIndex: session.dayIndex, ...terminalFields }
    })
    persistTerminalSession(session, { completed: true })
    if (io) isolate(label, { code: 'ENDED_SWEEP_SCHEDULE_ERROR', ...fields }, () => scheduleEndedSweep(io, session))
    return merged
}

// 끝난 판 끊긴 사람 정리 예약: 판 끝 순간 연결 없던 사람(죽은 뒤 끊김·유예 중 판 끝)은 떠난 명단에 안 들어가
// 판이 장부·메모리에 남고 판 끝 정리가 안 돌던 것 (BE-020), 그 안에 다시 붙은 사람은 결과 화면 그대로
function scheduleEndedSweep(io, session, deps = {}) {
    if (!io || !session?.id || endedSweepRuns.has(session.id)) return null
    const setTimeoutFn = deps.setTimeoutFn ?? setTimeout
    const delayMs = Number.isInteger(deps.delayMs) && deps.delayMs >= 0 ? deps.delayMs : ENDED_SWEEP_DELAY_MS
    const run = { session, timerId: null, clearTimeoutFn: deps.clearTimeoutFn ?? clearTimeout }
    run.timerId = setTimeoutFn(() => {
        if (endedSweepRuns.get(session.id) !== run) return
        endedSweepRuns.delete(session.id)
        isolateWithError('[끝난 판 끊긴 사람 정리 실패]', () => sweepDisconnectedFromEnded(io, session))
    }, delayMs)
    if (typeof run.timerId?.unref === 'function') run.timerId.unref()
    endedSweepRuns.set(session.id, run)
    return run
}

// 정리 예약 끄기 (판 끝 마무리·시험 초기화)
function cancelEndedSweep(gameId) {
    const run = endedSweepRuns.get(gameId)
    if (!run) return
    if (run.timerId !== null) run.clearTimeoutFn(run.timerId)
    endedSweepRuns.delete(gameId)
}

// 끝난 판에 아직 묶인 사람 중 연결 없는 사람만 빼고, 마지막이면 판 끝 마무리까지
function sweepDisconnectedFromEnded(io, session) {
    if (session.phase !== 'ENDED') return
    for (const uuid of [...session.players.keys()]) {
        if (isUuidConnected(io, uuid)) continue
        const result = gameSessionCore.endGameSessionForPlayer(uuid, 'PARTICIPANT_LEFT', session.id)
        if (!result.ok) continue
        if (result.sessionDeleted) {
            finalizeGameSessionEnd(io, result.session, result.reason, uuid, result.cleanupUuids)
            return
        }
    }
}

// matchmaking 쪽 방 상태 정리, 던져도 판 정리는 계속 (원본 에러 찍음)
function cleanupMatchmakingRooms(io, uuids, label) {
    isolateWithError(label, () => matchmaking.cleanupRoomStateForSessionParticipants(io, uuids))
}

// 판 지운 뒤 socket 쪽 마무리: 전적 저장 시작 → 타이머 정리 → 대기방 정리 → 종료 방송 → 채널 떼기, 단계마다 격리 (지도 07-③)
function finalizeGameSessionEnd(io, session, reason, leftUuid, cleanupUuids) {
    // 지워진 판의 밤 성공 수신 기록·끊긴 사람 정리 예약도 같이 비움
    deleteNightReceipts(session)
    cancelEndedSweep(session?.id)

    // 종료 방송 받을 사람은 정리 전에 정해 둠 (다른 판·대기방으로 간 사람 빼기)
    const endContext = isolateOr(null, '[GameSession 종료 수신 문맥 구성 실패]', { code: 'END_CONTEXT_ERROR', gameId: session?.id },
        () => buildSessionEndContext(session, leftUuid, cleanupUuids))

    // 승부 났으면 완료로, 아니면 나간 사람 적어 미완료로 저장 (같은 판은 한 번만 저장됨)
    isolateWithError('[GameSession 종료 시 전적 저장 실패]', () => {
        const completed = session.phase === 'ENDED' && !!session.winResult
        persistTerminalSession(session, {
            completed,
            disconnectedUuid: completed ? undefined : leftUuid,
        })
    })

    // 밤 턴·낮·역할 공개·재판 타이머·이탈 표식·끊김 유예 전부 끔 (지워진 판에 늦게 안 돌게)
    isolateWithError('[GameSession 종료 시 타이머 정리 실패]', () => {
        stopNightTurnSequence(session.id)
        stopDayPhaseTimer(session.id)
        stopRoleRevealTimer(session.id)
        stopTribunalTimer(session.id)
        clearDepartureMark(session.id)
        detachAllGraces(session.id)
    })

    cleanupMatchmakingRooms(io, cleanupUuids, '[GameSession 종료 시 matchmaking 정리 실패]')

    // 받을 사람을 못 정했으면 방송 안 함 (엉뚱한 사람에게 가는 것보다 안 가는 게 나음)
    isolateWithError('[GameSession 종료 알림 전송 실패]', () => {
        if (endContext) {
            emitToGameChannel(io, session, 'game_ended', { gameId: session.id, reason }, endContext)
        } else {
            console.error('[GameSession 종료 알림 폐기]', { code: 'END_EMIT_DROPPED', gameId: session?.id })
        }
    })

    // 판 채널에 남은 소켓 전부 떼기 (계정 없는 소켓은 건너뜀)
    isolateWithError('[GameSession channel 정리 실패]', () => {
        const registry = io?.sockets?.sockets
        if (registry && typeof registry.values === 'function') {
            for (const member of [...registry.values()]) {
                if (!member?.rooms?.has?.(session.channelId)) continue
                const memberUuid = member.data?.user?.uuid ?? null
                if (typeof memberUuid !== 'string') continue
                detachFromGameChannel(
                    member, memberUuid, session.channelId, '[GameSession channel 정리 실패]', { gameId: session.id },
                )
            }
        }
    })
}

module.exports = {
    withTerminalFields,
    scheduleEndedSweep,
    cancelEndedSweep,
    cleanupMatchmakingRooms,
    finalizeGameSessionEnd,
}
