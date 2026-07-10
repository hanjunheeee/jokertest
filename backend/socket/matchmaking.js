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
const gameSession    = require('./gameSession')

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

/**
 * socket에 매칭 관련 이벤트 핸들러를 등록합니다.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {string} uuid - 소켓 소유자의 유저 UUID
 */
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

/**
 * disconnect 시 큐·방 정리 — socket.js의 disconnect 핸들러에서 호출
 * @param {import('socket.io').Server} io
 * @param {string} uuid - 접속 종료한 유저 UUID
 */
function onDisconnect(io, uuid) {
    matchmakingQueue.delete(uuid)
    removeFromRoom(io, null, uuid)
}

/**
 * 유저를 매칭 큐에 등록하고, MIN_PLAYERS 이상 모이면 즉시 방을 생성합니다.
 * 이미 방에 참여 중인 유저는 무시됩니다. 닉네임 위조 방지를 위해 DB에서 직접 조회합니다.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {string} uuid - 매칭에 참여할 유저 UUID
 */
async function handleJoinMatchmaking(io, socket, uuid) {
    if (playerRoom.has(uuid)) return

    // 닉네임은 클라이언트 전송이 아닌 DB에서 조회 — 위조 방지
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

/**
 * 기존 방 코드 입력 UI와 연결되는 방 참가 핸들러입니다.
 * 개발 중 1인 방을 만든 뒤 코드로 두 번째 사용자를 붙여 2인 테스트를 할 수 있습니다.
 */
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

/**
 * 유저를 매칭 큐에서 제거합니다. (방 생성 전 이탈)
 * @param {string} uuid - 매칭을 취소할 유저 UUID
 */
function handleLeaveMatchmaking(uuid) {
    matchmakingQueue.delete(uuid)
}

/**
 * 방장이 방을 삭제합니다. 모든 참가자에게 'room_deleted'를 알리고 방/역방향 매핑을 정리합니다.
 * 방장이 아니면 아무 동작도 하지 않습니다.
 * @param {import('socket.io').Server} io
 * @param {string} uuid - 삭제를 요청한 유저 UUID
 */
function handleDeleteRoom(io, uuid) {
    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    const room = gameRooms.get(roomId)
    if (!room || room.hostUuid !== uuid) return // 방장만 삭제 가능

    io.to(roomId).emit('room_deleted', {})

    room.players.forEach((_, playerUuid) => playerRoom.delete(playerUuid))
    gameRooms.delete(roomId)
}

/**
 * 방장이 게임을 시작합니다. 모든 참가자에게 'game_started'를 알리고 방을 정리합니다.
 * 방장이 아니면 아무 동작도 하지 않습니다.
 * @param {import('socket.io').Server} io
 * @param {string} uuid - 시작을 요청한 유저 UUID
 */
async function handleStartGame(io, uuid) {
    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    const room = gameRooms.get(roomId)
    if (!room || room.hostUuid !== uuid) return // 방장만 시작 가능

    try {
        await gameSession.startGameFromRoom(io, room)
    } catch (error) {
        const socketId = [...io.sockets.sockets.values()]
            .find((socket) => socket.data?.user?.uuid === uuid)?.id
        if (socketId) {
            io.to(socketId).emit('game_start_failed', {
                message: error.message,
            })
        }
        return
    }

    room.players.forEach((_, playerUuid) => playerRoom.delete(playerUuid))
    gameRooms.delete(roomId)
}

/**
 * 방에서 플레이어를 제거합니다 — disconnect 시 socket=null로 호출해도 안전합니다.
 * 방장이 나가면 다음 플레이어에게 방장을 이관하고, 방이 비면 방을 삭제합니다.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket|null} socket - null이면 소켓 room leave를 생략
 * @param {string} uuid - 제거할 유저 UUID
 */
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
