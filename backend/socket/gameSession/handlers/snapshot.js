// 스냅샷 핸들러 파일
// 새로고침 복구 스냅샷 (판 상태·못 받은 밤 성공·연출 대기), register가 등록·시험은 gameSession.js로 부름
const gameSessionCore = require('../../../game-core/gameSession')
const { logRejection } = require('../../common/isolate')
const { rejectedReply, respond } = require('../../common/replies')
const { pickOptionalGameId, acceptRequest, acceptCoreResult, registryLogs } = require('../core/requests')
const { isCurrentSocketForUuid, isUuidConnected } = require('../connection/ownership')
const { cancelDisconnectGrace } = require('../connection/grace')
const { resyncSessionRouting } = require('../connection/routing')
const { isEligibleRecipient, hasOutsideMembership } = require('../delivery/eligibility')
const {
    getNightSuccessReceipts,
    copyNightSuccessPayload,
    collectPendingRecords,
    isNightAckWindowOpen,
} = require('../phase/night/receipts')
const { resolveNightWaitForSnap } = require('../phase/night/wait')

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
    // callback 없으면 처리 안 함 (답할 곳 없음)
    if (typeof callback !== 'function') return
    // ack: callback이 던져도 밖으로 안 샘
    const ack = (body) => respond(callback, body)
    // 지금 소켓·요청 모양 (판 id 없으면 지금 내 판)
    const fields = acceptRequest(ack, uuid, socket, payload, pickOptionalGameId)
    if (!fields) return
    const { gameId } = fields

    // 판 상태 받기, 유예 만료로 빠진 사람은 전용 문구로 거절
    const result = acceptCoreResult(ack, () => gameSessionCore.getSessionSnapshotForPlayer(uuid, gameId), {
        ...registryLogs('[세션 스냅샷 조회 에러]', '[세션 스냅샷 조회 registry 불일치]', uuid, gameId),
        publicReply: snapshotRejectedReply,
    })
    if (!result) return

    // 스냅샷 조회 성공이면 끊김 유예 풂 (라우팅 대기 검사보다 먼저, 지도 08-⑦)
    cancelDisconnectGrace(result.snapshot.gameId, uuid)

    // 사람마다 지금 연결됐는지 붙임 (끊긴 사람 표시용)
    const players = result.snapshot.players.map((player) => ({
        ...player,
        isConnected: isUuidConnected(io, player.uuid),
    }))

    // 아직 참여 중인 판이면 판 채널·밤 사건·연출 대기까지 봄
    const recoverySession = gameSessionCore.getActiveSessionForDeparture(uuid, result.snapshot.gameId)
    const nightSuccessRecovery = []
    let presentationWaiting = false
    if (recoverySession) {
        // 판엔 있는데 이 소켓이 아직 판 채널 밖이면 채널 다시 넣고 잠시 뒤 다시 달라고 답함
        if (!isEligibleRecipient(recoverySession, socket, uuid)
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

        // 진행 중이고 그 밤 사건 완료 신호를 아직 받을 때면 못 끝낸 내 사건 모으기
        const receiptStore = getNightSuccessReceipts(recoverySession)
        if (receiptStore
            && recoverySession.phase !== 'ENDED'
            && isNightAckWindowOpen(recoverySession, receiptStore.nightDayIndex)) {
            const membershipId = recoverySession.players.get(uuid)?.membershipId ?? null
            const pending = collectPendingRecords(receiptStore, uuid, membershipId)
            // 지금 소켓·받을 자격·다른 소속 없음 다 맞을 때만 다시 보냄 (옛 탭·다른 판 막기)
            if (pending.length > 0
                && isCurrentSocketForUuid(uuid, socket, io)
                && isEligibleRecipient(recoverySession, socket, uuid)
                && !hasOutsideMembership(recoverySession, uuid)) {
                // 여기부터 진짜 바뀜: 수신 기록을 이 소켓에 다시 묶음 (완료 신호를 이 소켓에서 받게)
                for (const record of pending) {
                    record.socket = socket
                    record.socketId = socket.id
                    nightSuccessRecovery.push(copyNightSuccessPayload(record.payload))
                }
            }
        }

        // 남의 사건 연출을 기다리는 중이면 대기 표시 (대기 알림 대상에도 넣음)
        presentationWaiting = resolveNightWaitForSnap(recoverySession, uuid)
    }

    // 판 상태 + 연결 표시 + 다시 보낼 밤 사건 + 대기 표시
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
