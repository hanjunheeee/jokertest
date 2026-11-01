// 판 끝 정리 파일
// 판 지우기 전 마무리(전적 저장·타이머·대기방·종료 방송·채널) + 승부 난 방송에 종료 필드, 나가기·끊김·판정이 씀
const gameSessionCore = require('../../../game-core/gameSession')
const matchmaking = require('../../matchmaking')
const { persistTerminalSession } = require('../../../service/gameRecord.service')
const { isolate, isolateOr, isolateWithError } = require('../../common/isolate')
const { detachAllDisconnectGraces } = require('../connection/grace')
const { buildSessionEndContext } = require('../delivery/eligibility')
const { detachFromSessionChannel, emitToGameChannel } = require('../delivery/broadcast')
const { deleteNightSuccessReceipts } = require('../phase/night/receipts')
const { stopNightTurnSequence } = require('../phase/night/turn')
const { stopDayPhaseTimer } = require('../phase/day')
const { clearDepartureResolveMark } = require('./marks')

// 승부 났으면 방송 내용에 종료 필드(전원 정체) 덧붙이고 전적 저장 시작, 저장은 안 기다림 (지도 06-⑩ · 07-①⑧)
// 종료 필드 만들다 던지면 원래 내용 그대로
function withTerminalFields(session, terminal, payload, label, fields) {
    if (!terminal) return payload
    let merged = payload
    isolate(label, { code: 'TERMINAL_BUILD_ERROR', ...fields }, () => {
        const terminalFields = gameSessionCore.buildTerminalFields(session)
        merged = payload ? { ...payload, ...terminalFields } : terminalFields
    })
    persistTerminalSession(session, { completed: true })
    return merged
}

// matchmaking 쪽 방 상태 정리, 던져도 판 정리는 계속 (원본 에러 찍음)
function cleanupMatchmakingRooms(io, uuids, label) {
    isolateWithError(label, () => matchmaking.cleanupRoomStateForSessionParticipants(io, uuids))
}

// 판 지우기 전 마무리: 전적 저장 시작 → 타이머 정리 → 대기방 정리 → 종료 방송 → 채널 떼기, 단계마다 격리 (지도 07-③)
function finalizeGameSessionEnd(io, session, reason, leftUuid, cleanupUuids) {
    deleteNightSuccessReceipts(session)

    // 종료 방송 받을 사람은 정리 전에 정해 둠 (다른 판·대기방으로 간 사람 빼기)
    const endContext = isolateOr(null, '[GameSession 종료 수신 문맥 구성 실패]', { code: 'END_CONTEXT_ERROR', gameId: session?.id },
        () => buildSessionEndContext(session, leftUuid, cleanupUuids))

    isolateWithError('[GameSession 종료 시 전적 저장 실패]', () => {
        const completed = session.phase === 'ENDED' && !!session.winResult
        persistTerminalSession(session, {
            completed,
            disconnectedUuid: completed ? undefined : leftUuid,
        })
    })

    isolateWithError('[GameSession 종료 시 타이머 정리 실패]', () => {
        stopNightTurnSequence(session.id)
        stopDayPhaseTimer(session.id)
        clearDepartureResolveMark(session.id)
        detachAllDisconnectGraces(session.id)
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

    isolateWithError('[GameSession channel 정리 실패]', () => {
        const registry = io?.sockets?.sockets
        if (registry && typeof registry.values === 'function') {
            for (const member of [...registry.values()]) {
                if (!member?.rooms?.has?.(session.channelId)) continue
                const memberUuid = member.data?.user?.uuid ?? null
                if (typeof memberUuid !== 'string') continue
                detachFromSessionChannel(
                    member, memberUuid, session.channelId, '[GameSession channel 정리 실패]', { gameId: session.id },
                )
            }
        }
    })
}

module.exports = {
    withTerminalFields,
    cleanupMatchmakingRooms,
    finalizeGameSessionEnd,
}
