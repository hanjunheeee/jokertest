// 다음 방 우편함 파일
// 끝난 판 참가자가 다음 방 찾기 + 방장이 만든 다음 방 알리기 (지도 09)
// matchmaking.js가 get_party_matching_room에 붙임, 알리기는 join/create가 방 만든 뒤 부름
const gameSession = require('../../../game-core/gameSession')
const { partyRoomByGameId } = require('../core/state')
const { PARTY_ROOM_TTL_MS } = require('../core/constants')
const { buildRoomPayload } = require('../room/view')
const { findAllLiveSockets } = require('../room/membership')

// 끝난 판의 다음 방 꺼내기 (30분 지났으면 지움, 따로 타이머 없음)
function readPartyRoom(gameId) {
    const entry = partyRoomByGameId.get(gameId)
    if (!entry) return null
    if (Date.now() - entry.createdAt > PARTY_ROOM_TTL_MS) {
        partyRoomByGameId.delete(gameId)
        return null
    }
    return entry.room
}

// 끝난 판 참가자가 다음 방 묻기 (자격은 game-core가 확인)
function handleGetPartyMatchingRoom(uuid, payload, callback) {
    if (typeof callback !== 'function') return
    // 판 id 안 보냈으면 내가 남아 있는 끝난 판으로
    const gameId = typeof payload?.gameId === 'string' && payload.gameId.length > 0
        ? payload.gameId
        : gameSession.getEndedGameId(uuid)
    // 끝난 판 없으면 실패 말고 빈 답
    if (!gameId) {
        callback({ ok: true, gameId: null, room: null })
        return
    }
    // 그 판 참가자 아니거나 기권했으면 방 없다고만 답함 (남의 판 다음 방 안 새게)
    if (!gameSession.canLookupPartyRoom(uuid, gameId)) {
        callback({ ok: true, gameId, room: null })
        return
    }
    callback({ ok: true, gameId, room: readPartyRoom(gameId) })
}

// 방장이 다음 방 만들면 끝난 판 사람들한테 알리고 우편함에 넣음
function notifyPartyOfRoom(io, hostUuid, room) {
    // 끝난 판 방장이면 그 판 채널·받을 사람까지, 아니면 내가 남은 끝난 판 id만
    const ctx = gameSession.getEndedPartyContext(hostUuid)
    const gameId = ctx?.gameId ?? gameSession.getEndedGameId(hostUuid)
    if (!gameId) return
    const payload = {
        gameId,
        room: buildRoomPayload(room),
    }
    // 우편함에 먼저 넣음 (알림 놓친 사람은 get_party_matching_room으로 꺼냄)
    partyRoomByGameId.set(gameId, { room: payload.room, createdAt: Date.now() })
    // 판 채널 + 사람마다 연결된 소켓 전부에 알림, 실패는 로그만
    try {
        if (ctx) {
            io.to(ctx.channelId).emit('party_matching_room_ready', payload)
        }
        const participantUuids = ctx?.participantUuids
            ?? gameSession.getEndedPlayerUuids(gameId, { excludeUuid: hostUuid })
        for (const participantUuid of participantUuids) {
            for (const participantSocket of findAllLiveSockets(io, participantUuid)) {
                participantSocket.emit('party_matching_room_ready', payload)
            }
        }
    } catch (err) {
        console.error('[종료된 판 파티 매칭 방 알림 실패]', err)
    }
}

module.exports = {
    readPartyRoom,
    handleGetPartyMatchingRoom,
    notifyPartyOfRoom,
}
