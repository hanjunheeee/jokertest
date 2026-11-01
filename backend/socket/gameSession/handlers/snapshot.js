// 스냅샷 핸들러 파일
// 새로고침 복구 스냅샷 (판 상태 + 못 받은 밤 성공 사건 + 연출 대기 여부), register가 등록함
const gameSessionCore = require('../../../game-core/gameSession')
const { logRejection } = require('../../common/isolate')
const { rejectedReply, respond } = require('../../common/replies')
const { pickOptionalGameId, acceptRequest, acceptCoreResult, registryLogs } = require('../core/requests')
const { isCurrentSocketForUuid, isUuidConnected } = require('../connection/ownership')
const { cancelDisconnectGrace } = require('../connection/grace')
const { resyncSessionRouting } = require('../connection/routing')
const { isEligibleSessionRecipient, hasMembershipOutsideSession } = require('../delivery/eligibility')
const {
    getNightSuccessReceipts,
    copyNightSuccessPayload,
    collectPendingNightSuccessRecords,
    isNightSuccessCompletionWindowOpen,
} = require('../phase/night/receipts')
const { resolveNightPresentationWaitingForSnapshot } = require('../phase/night/wait')

// 스냅샷 거절 답: 유예 만료로 빠진 사람은 다시 못 들어온다고 알림
function snapshotRejectedReply(code) {
    if (code === 'FORFEITED_FROM_SESSION') {
        return {
            ok: false,
            code,
            message: '연결이 끊겨 이 게임에서 제외되었습니다. 다시 참여할 수 없습니다.',
        }
    }
    return rejectedReply(code)
}

// 새로고침 복구 스냅샷: 내 판 상태 + 못 받은 밤 성공 사건 + 연출 대기 여부 (지도 08-⑦⑩)
function handleGetSessionSnapshot(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    const ack = (body) => respond(callback, body)
    // 지금 소켓·요청 모양
    const fields = acceptRequest(ack, uuid, socket, payload, pickOptionalGameId)
    if (!fields) return
    const { gameId } = fields

    const result = acceptCoreResult(ack, () => gameSessionCore.getSessionSnapshotForPlayer(uuid, gameId), {
        ...registryLogs('[세션 스냅샷 조회 에러]', '[세션 스냅샷 조회 registry 불일치]', uuid, gameId),
        publicReply: snapshotRejectedReply,
    })
    if (!result) return

    // 스냅샷 조회 성공이면 끊김 유예 풂 (라우팅 대기 검사보다 먼저, 지도 08-⑦)
    cancelDisconnectGrace(result.snapshot.gameId, uuid)

    const players = result.snapshot.players.map((player) => ({
        ...player,
        isConnected: isUuidConnected(io, player.uuid),
    }))

    const recoverySession = gameSessionCore.getActiveSessionForDeparture(uuid, result.snapshot.gameId)
    const nightSuccessRecovery = []
    let presentationWaiting = false
    if (recoverySession) {
        if (!isEligibleSessionRecipient(recoverySession, socket, uuid)
            && !socket.rooms?.has?.(recoverySession.channelId)
            && gameSessionCore.getActiveSessionRoutingInfo(uuid)?.channelId === recoverySession.channelId) {
            resyncSessionRouting(socket, uuid).catch(logRejection('\x1b[31m[세션 라우팅 재동기화 에러]\x1b[0m'))
            ack({
                ok: false,
                code: 'SESSION_ROUTING_PENDING',
                message: '게임 정보를 다시 불러오는 중입니다.',
            })
            return
        }

        const receiptStore = getNightSuccessReceipts(recoverySession)
        if (receiptStore
            && recoverySession.phase !== 'ENDED'
            && isNightSuccessCompletionWindowOpen(recoverySession, receiptStore.nightDayIndex)) {
            const membershipId = recoverySession.players.get(uuid)?.membershipId ?? null
            const pending = collectPendingNightSuccessRecords(receiptStore, uuid, membershipId)
            if (pending.length > 0
                && isCurrentSocketForUuid(uuid, socket, io)
                && isEligibleSessionRecipient(recoverySession, socket, uuid)
                && !hasMembershipOutsideSession(recoverySession, uuid)) {
                for (const record of pending) {
                    record.socket = socket
                    record.socketId = socket.id
                    nightSuccessRecovery.push(copyNightSuccessPayload(record.payload))
                }
            }
        }

        presentationWaiting = resolveNightPresentationWaitingForSnapshot(recoverySession, uuid)
    }

    ack({
        ok: true,
        ...result.snapshot,
        players,
        nightSuccessRecovery,
        presentationWaiting,
    })
}

module.exports = {
    handleGetSessionSnapshot,
}
