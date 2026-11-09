// 코드 입장 다시 보기 파일
// DB·채널 join 기다린 뒤 그사이 바뀐 것 다시 확인, join/join.js가 부름
const { emitRoomJoinFailed, describeVanishedRoom } = require('./guards')
const { ROOM_JOIN_ERROR_CODES } = require('../../roomJoinErrors')
const { playerRoom, gameRooms } = require('../core/state')
const { getGeneration } = require('./transition')
const { isCanonicalOrUnknown } = require('../room/membership')
const { getSupportedRoomSizes } = require('../core/config')
const { countRoomOccupancy } = require('../admission/attempts')

// 기다린 사이 다른 방 들어갔거나 판 끝 정리됐으면 거절 (지도 01-④)
// beforeReject = 거절 알림 전 정리 (join 뒤면 채널 떼기)
function rejectIfMovedOrEnded(socket, uuid, generationAtReservation, beforeReject = () => {}) {
    if (playerRoom.has(uuid)) {
        beforeReject()
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM, '이미 참여 중인 방이 있습니다.')
        return true
    }
    if (getGeneration(uuid) !== generationAtReservation) {
        beforeReject()
        emitRoomJoinFailed(
            socket,
            ROOM_JOIN_ERROR_CODES.SESSION_ENDED,
            '게임 세션이 종료되어 요청을 처리하지 못했습니다. 다시 시도해주세요.',
        )
        return true
    }
    return false
}

// 채널 떼고 붙은 방 기억 지우기 (거절 알림 전, 실패 때 catch가 또 떼지 않게)
function dropJoinedChannel(room, { channel, progress }) {
    channel.detach(room.id)
    progress.joinedRoomId = null
}

// join 뒤 연결 다시 보기: 끊김·소켓 바뀜·새 탭 주인·채널에 없음이면 거절하고 true (지도 01-⑦)
function rejectIfConnectionChanged(io, socket, uuid, room, ctx) {
    // 끊겼거나 소켓 바뀜·신원 바뀜·새 탭이 주인이면 채널 떼고 거절
    if (!socket.connected
        || socket.id !== ctx.socketIdAtRequest
        || socket.data?.user?.uuid !== uuid
        || !isCanonicalOrUnknown(io, uuid, socket, room.id)) {
        dropJoinedChannel(room, ctx)
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.DISCONNECTED, '연결이 끊어져 방에 참여하지 못했습니다.')
        return true
    }

    // join 끝났는데 채널에 없으면 거절, 붙은 게 없으니 뗄 것도 없음
    if (socket.rooms && typeof socket.rooms.has === 'function' && !socket.rooms.has(room.id)) {
        ctx.progress.joinedRoomId = null
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.INTERNAL_ERROR, '방에 참여하지 못했습니다. 잠시 후 다시 시도해주세요.')
        return true
    }
    return false
}

// join 뒤 방 다시 보기: 방 사라짐·종류 바뀜·다른 방·판 끝·자리 없음이면 채널 떼고 거절하고 true
function rejectIfRoomChanged(socket, uuid, room, ctx) {
    const drop = () => dropJoinedChannel(room, ctx)

    // 그사이 방이 사라졌으면 (시작·삭제·빈 방) 이유 골라 거절
    if (gameRooms.get(room.id) !== room) {
        drop()
        const vanished = describeVanishedRoom({ roomCode: room.code, roomId: room.id })
        if (vanished) {
            emitRoomJoinFailed(socket, ...vanished)
            return true
        }
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '방을 찾을 수 없습니다.')
        return true
    }

    // 고른 방 그대로인지 (같은 id·같은 공개 종류, 그사이 종류 바뀌면 거절)
    const { expectedRoom } = ctx
    if (expectedRoom && (room.id !== expectedRoom.roomId || room.accessType !== expectedRoom.accessType)) {
        drop()
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '공개 방을 찾을 수 없습니다.')
        return true
    }

    // join도 기다렸으니 다른 방·판 끝 정리 다시 확인
    if (rejectIfMovedOrEnded(socket, uuid, ctx.generationAtReservation, drop)) return true

    // 자리 남았는지 (초대로 자리 잡은 사람도 셈), 여기서 명단 추가까지 await 없음 (지도 01-⑧)
    const maxRoomSize = room.settings?.maxPlayers ?? getSupportedRoomSizes()[0]
    if (countRoomOccupancy(room, uuid) >= maxRoomSize) {
        drop()
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_FULL, '방이 가득 찼습니다.')
        return true
    }
    return false
}

module.exports = {
    rejectIfMovedOrEnded,
    rejectIfConnectionChanged,
    rejectIfRoomChanged,
}
