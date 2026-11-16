// 판 끝 정리 파일
// core가 판 지운 뒤 마무리(전적 저장·타이머·대기방·종료 방송·채널) + 승부 난 방송에 종료 필드 + 판 끝 180초 시계(같은 방 다시 열기·결과 화면 닫기)
// + 한 사람을 끝난 판에서 빼기, 판 끝 마무리는 나가기·끊김, 종료 필드는 재판·밤·이탈 뒤 판정, 대기방 정리는 나가기가 씀
const gameSessionCore = require('../../../game-core/gameSession')
const matchmaking = require('../../matchmaking')
const returnRoom = require('../../matchmaking/room/returnRoom')
const { persistTerminalSession } = require('../../../services/game/record')
const { isolate, isolateOr, isolateWithError } = require('../../common/isolate')
const { endedSweepRuns } = require('../core/state')
const { pickTimerFns } = require('../core/timers')
const { detachAllGraces } = require('../connection/grace')
const { buildSessionEndContext } = require('../delivery/eligibility')
const { detachFromGameChannel, emitToGameChannel } = require('../delivery/broadcast')
const { stopNightTurnSequence } = require('../phase/night/turn')
const { stopDayPhaseTimer } = require('../phase/day')
const { stopRoleRevealTimer } = require('../phase/roleReveal')
const { stopTribunalTimer } = require('../phase/tribunal')
const chatBuffer = require('../../../services/ops/chatBuffer')

// 승부 났으면 방송 내용에 종료 필드(전원 정체·결과 화면 닫힘 시각) 덧붙이고 전적 저장 시작·180초 시계 걸기, 저장은 안 기다림 (지도 06-⑩ · 07-①⑧)
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
    markChatEnded(session)
    if (io) isolate(label, { code: 'ENDED_SWEEP_SCHEDULE_ERROR', ...fields }, () => scheduleEndedSweep(io, session))
    return merged
}

// 판 채팅 보관 끝 표시: 승패가 난 때부터 10분만 들고 있음 (결과 화면 신고용)
// 판을 지울 때만 붙이면 결과 화면 180초만큼 더 남고, 결과 화면을 안 닫으면 아예 안 붙음, 두 번 불려도 처음 시각 그대로
function markChatEnded(session) {
    isolateWithError('[판 채팅 보관 끝 표시 실패]', () => chatBuffer.markGameEnded(session?.id))
}

// 판 끝 180초 시계 걸기 (판 끝 순간 한 번, 판 끝 시각부터 하나로 셈, 결정 [임시] 4)
// 걸 때 같은 코드·설정 빈 대기방을 다시 열고(matchmaking/room/returnRoom.js), 180초에 결과 화면 남은 사람 내보내기 → 방장 자리·빈 방 정리
// 판 끝 순간 끊겨 있던 사람(죽은 뒤 끊김·유예 중 판 끝)도 이때 빠짐 (예전 60초 정리를 합침, BE-020)
// 이름은 예전 그대로 (이탈 반영 departure/apply.js가 부름), 같은 판에 두 번 불려도 한 번만
function scheduleEndedSweep(io, session, deps = {}) {
    if (!io || !session?.id || endedSweepRuns.has(session.id)) return null
    const { nowFn, setTimeoutFn, clearTimeoutFn } = pickTimerFns(deps)
    const closesAt = gameSessionCore.getResultClosesAt(session) ?? nowFn() + gameSessionCore.RESULT_SCREEN_MS
    const delayMs = Number.isInteger(deps.delayMs) && deps.delayMs >= 0 ? deps.delayMs : Math.max(0, closesAt - nowFn())
    isolateWithError('[판 끝 같은 방 다시 열기 실패]', () => returnRoom.reopenRoomAfterGame(io, session))
    const run = { session, timerId: null, clearTimeoutFn }
    run.timerId = setTimeoutFn(() => {
        if (endedSweepRuns.get(session.id) !== run) return
        endedSweepRuns.delete(session.id)
        isolateWithError('[판 끝 결과 화면 닫기 실패]', () => closeEndedResults(io, session))
        isolateWithError('[판 끝 같은 방 180초 정리 실패]', () => returnRoom.closeReturnHold(io, session.id))
    }, delayMs)
    if (typeof run.timerId?.unref === 'function') run.timerId.unref()
    endedSweepRuns.set(session.id, run)
    return run
}

// 180초 시계 끄기 (판이 다시 연 방 없이 지워짐·시험 초기화)
function cancelEndedSweep(gameId) {
    const run = endedSweepRuns.get(gameId)
    if (!run) return
    if (run.timerId !== null) run.clearTimeoutFn(run.timerId)
    endedSweepRuns.delete(gameId)
}

// 결과 화면 닫힘 알림: 판 채널에 붙은 그 사람 소켓에만 (다른 방에 이미 앉았으면 안 보냄, 그 화면은 대기방)
// 예: { gameId:'g-1', reason:'RESULT_TIMEOUT' } → 화면은 로비로
function notifyResultClosed(io, session, uuid) {
    if (matchmaking.hasRoomMembership(uuid)) return
    for (const s of io?.sockets?.sockets?.values?.() ?? []) {
        if (s?.data?.user?.uuid !== uuid || !s.rooms?.has?.(session.channelId)) continue
        try {
            s.emit('game_result_closed', { gameId: session.id, reason: 'RESULT_TIMEOUT' })
        } catch (err) {
            console.error('[결과 화면 닫힘 알림 실패]', err)
        }
    }
}

// 180초: 결과 화면에 남은 사람(끊긴 채 남은 사람 포함) 알리고 끝난 판에서 뺌, 마지막이면 판 끝 마무리까지
function closeEndedResults(io, session) {
    if (session.phase !== 'ENDED') return
    for (const uuid of gameSessionCore.getBoundEndedPlayerUuids(session.id)) {
        isolate('[결과 화면 닫기 실패]', { code: 'RESULT_CLOSE_ERROR', uuid, gameId: session.id }, () => {
            notifyResultClosed(io, session, uuid)
            leaveEndedSession(io, uuid, 'RESULT_TIMEOUT', session.id)
        })
    }
}

// 한 사람을 끝난 판에서 빼기: 판 기록 지우기 → (넘긴 소켓) 판 채널 떼기 → 마지막이면 판 끝 마무리, 아니면 남겨 둔 방장 자리 정리
// "대기방으로"(matchmaking/room/returnRoom.js)·180초 시계·로비 입장 정리(matchmaking/room/lobbyEntry.js)가 부름
// 이 끝난 판에 묶인 사람이 아니면(이미 빠짐·진행 중 판·다른 판) 아무것도 안 하고 { ok:false, code:'NOT_IN_ENDED_SESSION' }
function leaveEndedSession(io, uuid, reason, gameId, { socket = null } = {}) {
    if (gameSessionCore.getEndedGameId(uuid) !== gameId) return { ok: false, code: 'NOT_IN_ENDED_SESSION' }
    const result = gameSessionCore.endGameSessionForPlayer(uuid, reason, gameId)
    if (!result.ok) return result
    if (socket) {
        isolateWithError('[끝난 판 채널 떼기 실패]', () => detachFromGameChannel(
            socket, uuid, result.session.channelId, '[끝난 판 채널 떼기 실패]', { gameId },
        ))
    }
    if (result.sessionDeleted) {
        finalizeGameSessionEnd(io, result.session, result.reason, uuid, result.cleanupUuids)
        return result
    }
    cleanupMatchmakingRooms(io, [uuid], '[끝난 판 빼기 matchmaking 정리 실패]')
    return result
}

// matchmaking 쪽 방 상태 정리, 던져도 판 정리는 계속 (원본 에러 찍음)
function cleanupMatchmakingRooms(io, uuids, label) {
    isolateWithError(label, () => matchmaking.cleanupRoomStateForSessionParticipants(io, uuids))
}

// 판 지운 뒤 socket 쪽 마무리: 전적 저장 시작 → 타이머 정리 → 대기방 정리 → 종료 방송 → 채널 떼기, 단계마다 격리 (지도 07-③)
function finalizeGameSessionEnd(io, session, reason, leftUuid, cleanupUuids) {
    // 다시 연 같은 방이 있으면 180초 시계는 그대로 둠 (방장 자리·빈 방 정리), 없으면 시계 끄고 판 동안 잡아 둔 방 코드 놓음
    isolateWithError('[판 끝 180초 시계 정리 실패]', () => {
        if (!returnRoom.settleReturnOnSessionGone(session)) cancelEndedSweep(session?.id)
    })
    // 승패 없이 지워진 판(전원 나감·점검)은 여기서 채팅 보관 끝 표시, 승패 난 판은 이미 붙어 있어 그대로
    markChatEnded(session)

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

    // 밤 턴·낮·역할 공개·재판 타이머·끊김 유예 전부 끔 (지워진 판에 늦게 안 돌게)
    isolateWithError('[GameSession 종료 시 타이머 정리 실패]', () => {
        stopNightTurnSequence(session.id)
        stopDayPhaseTimer(session.id)
        stopRoleRevealTimer(session.id)
        stopTribunalTimer(session.id)
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

// "대기방으로"가 끝난 판에서 빼는 함수를 쓰게 넣어 줌 (matchmaking이 이 파일을 require 하면 고리가 생겨서)
returnRoom.setEndedSessionHooks({ leaveEndedSession })

module.exports = {
    withTerminalFields,
    markChatEnded,
    scheduleEndedSweep,
    cancelEndedSweep,
    leaveEndedSession,
    cleanupMatchmakingRooms,
    finalizeGameSessionEnd,
}
