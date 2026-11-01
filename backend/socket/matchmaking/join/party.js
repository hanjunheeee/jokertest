// 다음 방 우편함 파일
// 끝난 판 참가자가 다음 방 찾기 + 방장이 만든 다음 방 알리기 (지도 09)
const gameSession = require('../../../game-core/gameSession')
const { partyMatchingRoomByGameId } = require('../core/state')
const { PARTY_MATCHING_ROOM_TTL_MS } = require('../core/constants')
const { buildRoomPayload } = require('../room/view')
const { findAllLiveSocketsForUuid } = require('../room/membership')

// 끝난 판의 다음 방 꺼내기 (30분 지났으면 지움)
function readPartyMatchingRoomForGame(gameId) {
    const entry = partyMatchingRoomByGameId.get(gameId)
    if (!entry) return null
    if (Date.now() - entry.createdAt > PARTY_MATCHING_ROOM_TTL_MS) {
        partyMatchingRoomByGameId.delete(gameId)
        return null
    }
    return entry.room
}

// 끝난 판 참가자가 다음 방 묻기 (자격은 game-core가 확인)
function handleGetPartyMatchingRoom(uuid, payload, callback) {
    if (typeof callback !== 'function') return
    const gameId = typeof payload?.gameId === 'string' && payload.gameId.length > 0
        ? payload.gameId
        : gameSession.getEndedSessionGameIdForParticipant(uuid)
    if (!gameId) {
        callback({ ok: true, gameId: null, room: null })
        return
    }
    if (!gameSession.canLookupPartyMatchingRoom(uuid, gameId)) {
        callback({ ok: true, gameId, room: null })
        return
    }
    callback({ ok: true, gameId, room: readPartyMatchingRoomForGame(gameId) })
}

// 방장이 다음 방 만들면 끝난 판 사람들한테 알리고 우편함에 넣음
function notifyEndedSessionPartyOfMatchingRoom(io, hostUuid, room) {
    const ctx = gameSession.getEndedSessionPartyBroadcastContext(hostUuid)
    const gameId = ctx?.gameId ?? gameSession.getEndedSessionGameIdForParticipant(hostUuid)
    if (!gameId) return
    const payload = {
        gameId,
        room: buildRoomPayload(room),
    }
    partyMatchingRoomByGameId.set(gameId, { room: payload.room, createdAt: Date.now() })
    try {
        if (ctx) {
            io.to(ctx.channelId).emit('party_matching_room_ready', payload)
        }
        const participantUuids = ctx?.participantUuids
            ?? gameSession.getEndedSessionParticipantUuids(gameId, { excludeUuid: hostUuid })
        for (const participantUuid of participantUuids) {
            for (const participantSocket of findAllLiveSocketsForUuid(io, participantUuid)) {
                participantSocket.emit('party_matching_room_ready', payload)
            }
        }
    } catch (err) {
        console.error('[종료된 판 파티 매칭 방 알림 실패]', err)
    }
}

module.exports = {
    readPartyMatchingRoomForGame,
    handleGetPartyMatchingRoom,
    notifyEndedSessionPartyOfMatchingRoom,
}
