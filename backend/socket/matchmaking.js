const crypto         = require('crypto')
const userRepository = require('../repositories/user.repositories')
const { generateRoomCode } = require('../utils/roomCode')
// NOTE: 게임 시작(handleStartGame)은 원래 gameSession.startGameFromRoom을 호출하는데,
// game-core/gameSession은 아직 없는 상태(인게임 단계에서 만들 예정)라 지금은
// 방 정리 + game_started 브로드캐스트만 하는 스텁으로 둡니다.

const OFFICIAL_MIN_PLAYERS = 5
const OFFICIAL_ROOM_SIZES = [10, 8, 6, 5]
const DEVELOPMENT_ROOM_SIZES = [10, 8, 6, 5, 2, 1]

function isDevelopmentMatchmaking() {
    return process.env.NODE_ENV !== 'production'
}

function getMinPlayers() {
    if (!isDevelopmentMatchmaking()) return OFFICIAL_MIN_PLAYERS
    const configured = Number(process.env.GAME_DEV_MIN_PLAYERS ?? 1)
    return Number.isInteger(configured) && configured > 0 ? configured : 1
}

function getSupportedRoomSizes() {
    return isDevelopmentMatchmaking() ? DEVELOPMENT_ROOM_SIZES : OFFICIAL_ROOM_SIZES
}

/** uuid → { uuid, nickname, socketId } */
const matchmakingQueue = new Map()

/** roomId → { id, code, hostUuid, players: Map<uuid, { uuid, nickname }> } */
const gameRooms = new Map()

/** uuid → roomId — 역방향 조회용 */
const playerRoom = new Map()

function registerMatchmakingHandlers(io, socket, uuid) {
    socket.on('join_matchmaking', () =>
        handleJoinMatchmaking(io, socket, uuid).catch((err) =>
            console.error('\x1b[31m[매칭 진입 에러]\x1b[0m', err)
        )
    )
    socket.on('leave_matchmaking', () => handleLeaveMatchmaking(uuid))
    socket.on('join_room_by_code', ({ roomCode } = {}) =>
        handleJoinRoomByCode(io, socket, uuid, roomCode).catch((err) =>
            console.error('\x1b[31m[방 코드 참가 에러]\x1b[0m', err)
        )
    )
    socket.on('delete_room',       () => handleDeleteRoom(io, uuid))
    socket.on('start_game',        () =>
        handleStartGame(io, uuid).catch((err) =>
            console.error('\x1b[31m[게임 시작 에러]\x1b[0m', err)
        )
    )
    socket.on('leave_room',        () => removeFromRoom(io, socket, uuid))
}

function onDisconnect(io, uuid) {
    matchmakingQueue.delete(uuid)
    removeFromRoom(io, null, uuid)
}

async function handleJoinMatchmaking(io, socket, uuid) {
    if (playerRoom.has(uuid)) return

    const user = await userRepository.findByUuid(uuid)
    if (!user) return

    matchmakingQueue.set(uuid, { uuid, nickname: user.nickname, socketId: socket.id })
    socket.emit('matchmaking_queued', { position: matchmakingQueue.size })

    if (matchmakingQueue.size < getMinPlayers()) return

    const queuedPlayers = [...matchmakingQueue.values()]
    const roomSize = getSupportedRoomSizes().find((size) => queuedPlayers.length >= size)
    if (!roomSize) return

    const players = queuedPlayers.slice(0, roomSize)
    players.forEach((player) => matchmakingQueue.delete(player.uuid))

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

function buildRoomPayload(room) {
    return {
        roomId: room.id,
        roomCode: room.code,
        players: [...room.players.values()],
        hostUuid: room.hostUuid,
    }
}

async function handleJoinRoomByCode(io, socket, uuid, roomCode) {
    const normalizedCode = String(roomCode ?? '').trim()
    if (!normalizedCode) {
        socket.emit('room_join_failed', { message: '방 코드를 입력해주세요.' })
        return
    }

    if (playerRoom.has(uuid)) {
        socket.emit('room_join_failed', { message: '이미 참여 중인 방이 있습니다.' })
        return
    }

    const room = [...gameRooms.values()].find((candidate) => candidate.code === normalizedCode)
    if (!room) {
        socket.emit('room_join_failed', { message: '방을 찾을 수 없습니다.' })
        return
    }

    const maxRoomSize = getSupportedRoomSizes()[0]
    if (room.players.size >= maxRoomSize) {
        socket.emit('room_join_failed', { message: '방이 가득 찼습니다.' })
        return
    }

    const user = await userRepository.findByUuid(uuid)
    if (!user) {
        socket.emit('room_join_failed', { message: '사용자 정보를 찾을 수 없습니다.' })
        return
    }

    const player = { uuid, nickname: user.nickname }
    room.players.set(uuid, player)
    playerRoom.set(uuid, room.id)
    socket.join(room.id)

    socket.emit('room_joined', buildRoomPayload(room))
    socket.to(room.id).emit('player_joined_room', { player })
}

function handleLeaveMatchmaking(uuid) {
    matchmakingQueue.delete(uuid)
}

function handleDeleteRoom(io, uuid) {
    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    const room = gameRooms.get(roomId)
    if (!room || room.hostUuid !== uuid) return

    io.to(roomId).emit('room_deleted', {})

    room.players.forEach((_, playerUuid) => playerRoom.delete(playerUuid))
    gameRooms.delete(roomId)
}

async function handleStartGame(io, uuid) {
    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    const room = gameRooms.get(roomId)
    if (!room || room.hostUuid !== uuid) return

    // TODO: 인게임 단계에서 game-core/gameSession이 생기면 여기서
    // await gameSession.startGameFromRoom(io, room) 호출로 교체합니다.
    io.to(roomId).emit('game_started', {})

    room.players.forEach((_, playerUuid) => playerRoom.delete(playerUuid))
    gameRooms.delete(roomId)
}

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

    if (room.hostUuid === uuid) {
        room.hostUuid = room.players.keys().next().value
        io.to(roomId).emit('host_changed', { hostUuid: room.hostUuid })
    }

    io.to(roomId).emit('player_left_room', { uuid })
}

module.exports = { registerMatchmakingHandlers, onDisconnect }
