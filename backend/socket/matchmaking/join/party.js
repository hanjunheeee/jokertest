// 다음 방 우편함 파일
// 끝난 판 참가자가 다음 방 찾기 + 방장이 만든 다음 방 알리기 (지도 09)
// matchmaking.js가 get_party_matching_room에 붙임, 알리기는 join/create가 방 만든 뒤 부름
const gameSession = require('../../../game-core/gameSession')
const { partyRoomByGameId, gameRooms } = require('../core/state')
const { PARTY_ROOM_TTL_MS } = require('../core/constants')
const { buildRoomPayload } = require('../room/view')
const { userChannelOf } = require('../../emitter')
const { isRoomRoutingEnabled, findPartyGameOwner } = require('../cluster/roomRouting')
const { gameSessions } = require('../../../game-core/core/registry/state')

// Node 여러 개: 끝난 판이 이 Node에 없고 다른 Node에 있으면 { ok:false, code, node }로 답함 (조각 5 약속, MN-011)
// 못 찾으면 예전처럼 방 없음, 답했으면(답할 예정이면) true
function answerFromOtherNode(gameId, callback) {
    if (!isRoomRoutingEnabled() || gameSessions.has(gameId)) return false
    findPartyGameOwner(gameId).then(
        (failure) => callback(failure ? { ok: false, gameId, ...failure } : { ok: true, gameId, room: null }),
        () => callback({ ok: true, gameId, room: null }),
    ).catch((err) => console.error('[다음 방 답 실패]', err))
    return true
}

// 끝난 판의 다음 방 꺼내기 (30분 지났으면 지움, 따로 타이머 없음)
// 그 방이 지워졌거나 시작돼 없으면 우편함도 지우고 없음 (없어진 방 돌려줘 입장 실패 되풀이 막기, known 1-5)
// 있으면 지금 명단·설정으로 다시 만들어 줌 (넣을 때 찍은 옛 명단 말고)
function readPartyRoom(gameId) {
    const entry = partyRoomByGameId.get(gameId)
    if (!entry) return null
    if (Date.now() - entry.createdAt > PARTY_ROOM_TTL_MS) {
        partyRoomByGameId.delete(gameId)
        return null
    }
    const live = gameRooms.get(entry.room?.roomId)
    if (!live || (live.instanceId ?? null) !== (entry.room?.roomInstanceId ?? null)) {
        partyRoomByGameId.delete(gameId)
        return null
    }
    return buildRoomPayload(live)
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
        if (answerFromOtherNode(gameId, callback)) return
        callback({ ok: true, gameId, room: null })
        return
    }
    callback({ ok: true, gameId, room: readPartyRoom(gameId) })
}

// 방장이 다음 방 만들면 끝난 판 사람들한테 알리고 우편함에 넣음
// 그 끝난 판 방장일 때만 (방장 아닌 참가자가 만든 방은 개인 방이라 남을 안 부르고 우편함도 안 덮음, BE-005)
function notifyPartyOfRoom(io, hostUuid, room) {
    const ctx = gameSession.getEndedPartyContext(hostUuid)
    if (!ctx?.gameId) return
    const payload = {
        gameId: ctx.gameId,
        room: buildRoomPayload(room),
    }
    // 우편함에 먼저 넣음 (알림 놓친 사람은 get_party_matching_room으로 꺼냄)
    partyRoomByGameId.set(ctx.gameId, { room: payload.room, createdAt: Date.now() })
    // 판 채널에 한 번, 채널 밖 소켓에만 계정 채널로 따로 (판 채널 빼서 같은 소켓이 두 번 받지 않게), 실패는 로그만
    // 판 채널은 이 Node 안에서만 (io.local, Redis 안 탐), 계정 채널은 다른 Node로 옮긴 사람에게도 감
    try {
        const local = io.local ?? io
        local.to(ctx.channelId).emit('party_matching_room_ready', payload)
        const participantChannels = ctx.participantUuids.map(userChannelOf).filter(Boolean)
        if (participantChannels.length > 0) {
            io.to(participantChannels).except(ctx.channelId).emit('party_matching_room_ready', payload)
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
