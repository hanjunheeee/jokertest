// 나가기·끊김 핸들러 파일
// 게임 중 나가기 + 소켓 끊김 처리, 나가기는 register가 등록·끊김은 socket.js가 gameSession.js 통해 부름
// 진행 중 판은 이탈 반영·끊김 유예, 끝난 판은 이 사람 정리 (마지막이면 판 끝 정리까지)
const gameSessionCore = require('../../../game-core/gameSession')
const { isolate } = require('../../common/isolate')
const { REPLY_MESSAGES, internalErrorReply, respond } = require('../../common/replies')
const { IDEMPOTENT_LEAVE_CODES } = require('../core/constants')
const { nightTurnRuns } = require('../core/state')
const { pickTrimmedGameId, acceptRequest } = require('../core/requests')
const { canProcessDisconnectFor, consumeOwnership } = require('../connection/ownership')
const { beginDisconnectGrace } = require('../connection/grace')
const { detachFromGameChannel } = require('../delivery/broadcast')
const { reevaluateNightWait } = require('../phase/night/wait')
const { cleanupMatchmakingRooms, finalizeGameSessionEnd } = require('../departure/end')
const { applyParticipantDeparture } = require('../departure/apply')

// 끝난 판에서 이 사람 정리 (나가기·끊김이 같이 씀), 던지면 라벨 + 원본 에러 찍음
// 통과면 { result }, 던졌으면 { threw: true }
function endSessionForPlayer(uuid, reason, gameId, label) {
    try {
        return { result: gameSessionCore.endGameSessionForPlayer(uuid, reason, gameId) }
    } catch (err) {
        console.error(label, err)
        return { threw: true }
    }
}

// 게임 중 나가기: 진행 중이면 나만 빼고 판은 계속, 끝난 판이면 결과 화면 닫기 처리 (지도 12)
function handleLeaveGameSession(io, socket, uuid, payload, callback) {
    // callback 없으면 처리 안 함 (답할 곳 없음)
    if (typeof callback !== 'function') return
    // ack: callback이 던져도 밖으로 안 샘
    const ack = (body) => respond(callback, body)
    // 지금 소켓·요청 모양 (지도 12-③④)
    const fields = acceptRequest(ack, uuid, socket, payload, pickTrimmedGameId)
    if (!fields) return
    const normalizedGameId = fields.gameId

    // 요청 판 id가 지금 판이랑 다르면 진행 중 갈래를 안 탐 (지도 12-⑤)
    const activeSession = gameSessionCore.getActiveSessionForDeparture(uuid, normalizedGameId)
    if (activeSession && activeSession.phase !== 'ENDED') {
        const departed = applyParticipantDeparture(io, activeSession, uuid, { reason: 'PLAYER_LEFT' })
        // 이미 빠진 사람이 또 나가기면 성공으로 답함 (지도 12-⑥)
        if (departed.ok || IDEMPOTENT_LEAVE_CODES.has(departed.code)) {
            ack({ ok: true })
        } else {
            ack({
                ok: false,
                code: departed.code ?? 'INTERNAL_ERROR',
                message: REPLY_MESSAGES.FAILED,
            })
        }
        // 진짜 빠졌을 때만 판 채널 떼고 대기방 상태 정리
        if (departed.ok) {
            detachFromGameChannel(
                socket, uuid, activeSession.channelId, '[게임 이탈 채널 정리 실패]', { gameId: activeSession.id },
            )
            cleanupMatchmakingRooms(io, [uuid], '[게임 이탈 시 matchmaking 정리 실패]')
        }
        return
    }

    // 끝난 판(결과 화면)에서 나가기: 판에 없어도 성공으로 답함
    const closed = endSessionForPlayer(uuid, 'PLAYER_LEFT', normalizedGameId, '[게임 이탈 처리 에러]')
    // 정리하다 던졌으면 내부 오류
    if (closed.threw) {
        ack(internalErrorReply())
        return
    }
    const { result } = closed

    // 답 먼저, 정리된 게 없으면(판 없음·다른 판) 여기서 끝
    const ended = result.ok
    ack({ ok: true })
    if (!ended) return

    // 마지막 사람이 나가서 판이 지워졌으면 판 끝 정리까지
    if (result.sessionDeleted) {
        finalizeGameSessionEnd(io, result.session, result.reason, uuid, result.cleanupUuids)
        return
    }
    // 판이 남았으면 내 대기방 상태만 정리
    cleanupMatchmakingRooms(io, [uuid], '[ENDED 게임 이탈 시 matchmaking 정리 실패]')
}

// 끊긴 사람을 연출 기다림에서 빼 보기 (기다리던 사람이 끊기면 상한까지 안 기다리게, 지도 05-⑨)
function reevaluateOnDisconnect(gameId) {
    const run = nightTurnRuns.get(gameId)
    if (!run || !run.wait) return
    isolate('[연결 종료 처리 실패]', { code: 'WAIT_REEVALUATE_ERROR', gameId },
        () => reevaluateNightWait(run, run.wait))
}

// 소켓 끊김: 진짜 주인 소켓일 때만, 진행 중 판이면 유예만 걸고 판은 그대로 (지도 08-①②⑤)
async function onDisconnect(io, socket, uuid) {
    // 주인 소켓 아니면 무시, 맞으면 소유 기록 소비 (같은 끊김 두 번 처리 막기)
    if (!canProcessDisconnectFor(io, socket, uuid)) return
    consumeOwnership(socket, uuid)

    // 판 채널에 붙은 적 없는 소켓이면 할 일 없음
    const expectedGameId = socket?.data?.activeGameId
    if (expectedGameId === undefined) return

    // 살아 있는 참가자: 유예 걸고 연출 기다림만 다시 봄
    const graceTarget = gameSessionCore.getDisconnectGraceTarget(uuid, expectedGameId)
    if (graceTarget) {
        beginDisconnectGrace(io, graceTarget.session, uuid)
        reevaluateOnDisconnect(graceTarget.session.id)
        return
    }

    // 죽은 참가자 등 유예 없는 사람: 판이 진행 중이면 자리·재입장 권리 그대로
    const reconnectState = gameSessionCore.getSessionSnapshotForPlayer(uuid, expectedGameId)
    if (reconnectState.ok && ['ROLE_REVEAL', 'DAY', 'NIGHT', 'TRIBUNAL'].includes(reconnectState.snapshot.phase)) {
        reevaluateOnDisconnect(expectedGameId)
        return
    }

    // 끝난 판: 이 사람 정리, 마지막이면 판 끝 정리까지
    const closed = endSessionForPlayer(uuid, 'PARTICIPANT_LEFT', expectedGameId, '[GameSession 종료 처리 에러]')
    // 던졌거나 정리된 게 없거나 판이 남았으면 끝 (답할 사람 없음)
    if (closed.threw) return
    const { result } = closed
    if (!result.ok) return
    if (!result.sessionDeleted) return

    finalizeGameSessionEnd(io, result.session, result.reason, uuid, result.cleanupUuids)
}

module.exports = {
    handleLeaveGameSession,
    onDisconnect,
}
