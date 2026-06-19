/**
 * @file matchmaking.js
 * @desc 랜덤 매칭 큐 · 게임 방 관리 (in-memory)
 *
 * 큐에 MIN_PLAYERS 이상 쌓이면 즉시 방을 생성합니다.
 * 멀티 인스턴스로 확장 시 Redis pub/sub으로 큐를 공유해야 합니다.
 */

const crypto         = require('crypto')
const userRepository = require('../repositories/user.repositories')
const { generateRoomCode } = require('../utils/roomCode')

const MIN_PLAYERS = 2

/** uuid → { uuid, nickname, socketId } */
const matchmakingQueue = new Map()

/** roomId → { id, code, hostUuid, players: Map<uuid, { uuid, nickname }> } */
const gameRooms = new Map()

/** uuid → roomId — 역방향 조회용 */
const playerRoom = new Map()

/** socket에 매칭 관련 이벤트 핸들러를 등록합니다. */
function registerMatchmakingHandlers(io, socket, uuid) {
    socket.on('join_matchmaking', () =>
        handleJoinMatchmaking(io, socket, uuid).catch((err) =>
            console.error('\x1b[31m[매칭 진입 에러]\x1b[0m', err)
        )
    )
    socket.on('leave_matchmaking', () => handleLeaveMatchmaking(uuid))
    socket.on('delete_room',       () => handleDeleteRoom(io, uuid))
    socket.on('start_game',        () => handleStartGame(io, uuid))
    socket.on('leave_room',        () => removeFromRoom(io, socket, uuid))
}

/** disconnect 시 큐·방 정리 — socket.js의 disconnect 핸들러에서 호출 */
function onDisconnect(io, uuid) {
    matchmakingQueue.delete(uuid)
    removeFromRoom(io, null, uuid)
}

async function handleJoinMatchmaking(io, socket, uuid) {
    if (playerRoom.has(uuid)) return

    // 닉네임은 클라이언트 전송이 아닌 DB에서 조회 — 위조 방지
    const user = await userRepository.findByUuid(uuid)
    if (!user) return

    matchmakingQueue.set(uuid, { uuid, nickname: user.nickname, socketId: socket.id })
    socket.emit('matchmaking_queued', { position: matchmakingQueue.size })

    if (matchmakingQueue.size < MIN_PLAYERS) return

    const players = [...matchmakingQueue.values()]
    matchmakingQueue.clear()

    const roomId     = crypto.randomUUID()
    const roomCode   = generateRoomCode()
    const hostUuid   = players[0].uuid
    const playersMap = new Map(players.map((p) => [p.uuid, { uuid: p.uuid, nickname: p.nickname }]))

    gameRooms.set(roomId, { id: roomId, code: roomCode, hostUuid, players: playersMap })
    players.forEach((p) => playerRoom.set(p.uuid, roomId))

    const playerList = players.map((p) => ({ uuid: p.uuid, nickname: p.nickname }))

    players.forEach(({ socketId }) => {
        const s = io.sockets.sockets.get(socketId)
        if (!s) return
        s.join(roomId)
        s.emit('match_found', { roomId, roomCode, players: playerList, hostUuid })
    })
}

function handleLeaveMatchmaking(uuid) {
    matchmakingQueue.delete(uuid)
}

function handleDeleteRoom(io, uuid) {
    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    const room = gameRooms.get(roomId)
    if (!room || room.hostUuid !== uuid) return // 방장만 삭제 가능

    io.to(roomId).emit('room_deleted', {})

    room.players.forEach((_, playerUuid) => playerRoom.delete(playerUuid))
    gameRooms.delete(roomId)
}

function handleStartGame(io, uuid) {
    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    const room = gameRooms.get(roomId)
    if (!room || room.hostUuid !== uuid) return // 방장만 시작 가능

    io.to(roomId).emit('game_started', { roomId })

    room.players.forEach((_, playerUuid) => playerRoom.delete(playerUuid))
    gameRooms.delete(roomId)
}

/** 방에서 플레이어 제거 — disconnect 시 socket=null로 호출해도 안전 */
function removeFromRoom(io, socket, uuid) {
    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    const room = gameRooms.get(roomId)
    if (!room) return

    room.players.delete(uuid)
    playerRoom.delete(uuid)
    if (socket) socket.leave(roomId)

    if (room.players.size === 0) {
        gameRooms.delete(roomId)
        return
    }

    // 방장이 나가면 다음 플레이어로 이관
    if (room.hostUuid === uuid) {
        room.hostUuid = room.players.keys().next().value
        io.to(roomId).emit('host_changed', { hostUuid: room.hostUuid })
    }

    io.to(roomId).emit('player_left_room', { uuid })
}

module.exports = { registerMatchmakingHandlers, onDisconnect }
