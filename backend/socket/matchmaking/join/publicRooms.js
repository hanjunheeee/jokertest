// 공개방 파일, 공개방 고르기 입장 + 공개 방 목록 (지도 09)
// matchmaking.js가 join_public_room·get_public_rooms에 붙임 (입장은 join.js 코드 입장 흐름 그대로)
const { rejectIfInGame, emitRoomJoinFailed, describeVanishedRoom } = require('./guards')
const { ROOM_JOIN_ERROR_CODES } = require('../../roomJoinErrors')
const { gameRooms } = require('../core/state')
const { buildPublicRoomList } = require('../room/view')
const { handleJoinRoomByCode } = require('./join')

// 공개방 고르기 입장 (코드 입장 흐름 그대로 씀)
async function handleJoinPublicRoom(io, socket, uuid, payload) {
    // 게임 중이면 요청 모양보다 먼저 거절
    if (rejectIfInGame(uuid, ({ code, message, gameId }) =>
        emitRoomJoinFailed(socket, code, message, { gameId })
    )) return

    // 요청 모양: 방 id 글자만
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.INVALID_REQUEST, '잘못된 요청입니다.')
        return
    }
    const { roomId } = payload
    if (typeof roomId !== 'string' || !roomId) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.INVALID_REQUEST, '잘못된 요청입니다.')
        return
    }

    // 방 없으면 시작 표시로 이유 고름
    const room = gameRooms.get(roomId)
    if (!room) {
        const vanished = describeVanishedRoom({ roomId })
        if (vanished) {
            emitRoomJoinFailed(socket, ...vanished)
            return
        }
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '공개 방을 찾을 수 없습니다.')
        return
    }
    // 코드 없이는 open 방만, code 방은 코드 쳐야 함
    if (room.accessType !== 'open') {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH, '이 방은 입장 코드가 필요합니다.')
        return
    }

    // 그 방 코드로 코드 입장 흐름 탐, 고른 방 id·종류 같이 넘겨 다른 방 못 들어가게
    await handleJoinRoomByCode(io, socket, uuid, room.code, { roomId: room.id, accessType: room.accessType })
}

// 공개 방 목록 보내 주기 (답 받을 곳 없으면 안 함)
function handleGetPublicRooms(callback) {
    if (typeof callback !== 'function') return
    callback({ ok: true, rooms: buildPublicRoomList() })
}

module.exports = {
    handleJoinPublicRoom,
    handleGetPublicRooms,
}
