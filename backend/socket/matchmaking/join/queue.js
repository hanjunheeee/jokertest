// 자동 매칭 줄 파일
// 자동 매칭 줄 서기 + 줄에서 빠지기 (지도 10)
const kickReceiptStore = require('../../kickReceiptStore')
const crypto = require('crypto')
const { rejectIfInActiveGame, emitRoomJoinFailed } = require('./guards')
const { isRandomMatchmakingEnabled, getMinPlayers, getSupportedRoomSizes } = require('../core/config')
const { playerRoom, matchmakingQueue, gameRooms } = require('../core/state')
const { getAdmissionAttempt } = require('../admission/attempts')
const { getRoomTransitionGeneration, acquireRoomTransition, releaseRoomTransition } = require('./transition')
const { deps } = require('../core/deps')
const { generateRoomCode } = require('../../../utils/roomCode')
const { buildRoomPayload } = require('../room/view')

// 자동 매칭 줄 서기, 인원 차면 방 만들어 넣음 (게임 중·방 안이면 거절)
async function handleJoinMatchmaking(io, socket, uuid) {
    if (rejectIfInActiveGame(uuid, ({ code, message, gameId }) =>
        emitRoomJoinFailed(socket, code, message, { gameId })
    )) return

    if (!isRandomMatchmakingEnabled()) {
        socket.emit('matchmaking_disabled', { message: '현재 빠른 매칭은 지원하지 않습니다.' })
        return
    }

    if (playerRoom.has(uuid)) return
    if (getAdmissionAttempt(uuid)) return

    const generationAtRequest = getRoomTransitionGeneration(uuid)
    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) return

    let user
    try {
        user = await deps.userRepository.findByUuid(uuid)
    } finally {
        releaseRoomTransition(uuid, transitionToken)
    }
    if (!user) return
    if (getRoomTransitionGeneration(uuid) !== generationAtRequest) return
    if (playerRoom.has(uuid) || getAdmissionAttempt(uuid)) return

    matchmakingQueue.set(uuid, { uuid, nickname: user.nickname, socketId: socket.id, generation: generationAtRequest })
    socket.emit('matchmaking_queued', { position: matchmakingQueue.size })

    if (matchmakingQueue.size < getMinPlayers()) return

    const queuedPlayers = [...matchmakingQueue.values()].filter(
        (entry) => getRoomTransitionGeneration(entry.uuid) === entry.generation
    )
    const roomSize = getSupportedRoomSizes().find((size) => queuedPlayers.length >= size)
    if (!roomSize) return

    const players = queuedPlayers.slice(0, roomSize)
    players.forEach((player) => matchmakingQueue.delete(player.uuid))

    const roomId     = crypto.randomUUID()
    const roomCode   = generateRoomCode()
    const hostUuid   = players[0].uuid
    const playersMap = new Map(players.map((p) => [p.uuid, {
        uuid: p.uuid,
        nickname: p.nickname,
        isReady: false,
        membershipId: kickReceiptStore.nextMembershipId(),
    }]))

    const room = { id: roomId, instanceId: crypto.randomUUID(), code: roomCode, hostUuid, players: playersMap }
    gameRooms.set(roomId, room)
    players.forEach((p) => playerRoom.set(p.uuid, roomId))

    const payload = buildRoomPayload(room)

    players.forEach(({ socketId }) => {
        const s = io.sockets.sockets.get(socketId)
        if (!s) return
        s.join(roomId)
        s.data.activeRoomId = roomId
        s.emit('match_found', { ...payload, players: payload.players.map((p) => ({ ...p })) })
    })
}

// 자동 매칭 줄에서 빠지기
function handleLeaveMatchmaking(uuid) {
    matchmakingQueue.delete(uuid)
}

module.exports = {
    handleJoinMatchmaking,
    handleLeaveMatchmaking,
}
