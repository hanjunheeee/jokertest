// 스냅샷 핸들러 파일
// 새로고침 복구 스냅샷 (판 상태·연결 표시), register가 등록·시험은 gameSession.js로 부름
const gameSessionCore = require('../../../game-core/gameSession')
const { logRejection } = require('../../common/isolate')
const { rejectedReply, respond } = require('../../common/replies')
const { pickOptionalGameId, acceptRequest, acceptCoreResult, registryLogs } = require('../core/requests')
const { isCurrentSocketForUuid, isUuidConnected } = require('../connection/ownership')
const { cancelDisconnectGrace } = require('../connection/grace')
const { resyncSessionRouting } = require('../connection/routing')
const { announceReconnected } = require('../connection/presenceNotice')
const { isEligibleRecipient } = require('../delivery/eligibility')
const { normalizeGameId } = require('../../../game-core/core/registry/lookup')
const { getPlayerGameId, hasSessionId } = require('../../../game-core/queries/byId')

// 물은 판이 이 서버에 없고 나도 아무 판에 없음 = 판이 사라짐 (서버 다시 켜짐 등)
// 장부 어긋남이 아니라서 숨기지 않고 판 없음으로 알림, 화면이 판을 지우고 멀티 화면으로 가게 하기
function isVanishedSession(uuid, gameId) {
    if (getPlayerGameId(uuid)) return false
    const normalized = normalizeGameId(gameId)
    return normalized !== '' && !hasSessionId(normalized)
}

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

// 새로고침 복구 스냅샷: 내 판 상태 + 사람마다 연결 표시 (지난 낮 시작 연출은 다시 안 틂, 지도 08-⑦)
function handleGetSessionSnapshot(io, socket, uuid, payload, callback) {
    // callback 없으면 처리 안 함 (답할 곳 없음)
    if (typeof callback !== 'function') return
    // ack: callback이 던져도 밖으로 안 샘
    const ack = (body) => respond(callback, body)
    // 지금 소켓·요청 모양 (판 id 없으면 지금 내 판)
    const fields = acceptRequest(ack, uuid, socket, payload, pickOptionalGameId)
    if (!fields) return
    const { gameId } = fields

    // 사라진 판이면 판 없음 그대로 답함 (아래 core 결과는 NOT_A_PARTICIPANT라 INTERNAL_ERROR로 숨겨져 화면이 판에 갇혔음)
    if (isVanishedSession(uuid, gameId)) {
        ack(snapshotRejectedReply('SESSION_NOT_FOUND'))
        return
    }

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

    // 아직 참여 중인 판이면 판 채널까지 봄
    const recoverySession = gameSessionCore.getActiveSessionForDeparture(uuid, result.snapshot.gameId)
    if (recoverySession) {
        // 판엔 있는데 이 소켓이 아직 판 채널 밖이면 채널 다시 넣고 잠시 뒤 다시 달라고 답함
        if (!isEligibleRecipient(recoverySession, socket, uuid)
            && !socket.rooms?.has?.(recoverySession.channelId)
            && gameSessionCore.getActiveSessionRoutingInfo(uuid)?.channelId === recoverySession.channelId) {
            resyncSessionRouting(socket, uuid, io).catch(logRejection('\x1b[31m[세션 라우팅 재동기화 에러]\x1b[0m'))
            ack({
                ok: false,
                code: 'SESSION_ROUTING_PENDING',
                message: '게임 정보를 다시 불러오는 중입니다.',
            })
            return
        }

        // 지금 탭이 판 채널에 있으면 판 사람들에게 다시 붙음 알림 (끊김 알린 사람만)
        if (isCurrentSocketForUuid(uuid, socket, io)) announceReconnected(io, recoverySession, uuid)
    }

    // 판 상태 + 연결 표시
    ack({
        ok: true,
        ...result.snapshot,
        players,
    })
}

module.exports = {
    handleGetSessionSnapshot,
}
