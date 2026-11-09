// 초대 서비스용 방 읽기 파일
// 초대 서비스가 쓰는 방 상태 읽는 함수 묶음, matchmaking.js가 cluster/inviteAccess.js로 감싸 넣음
const gameSession = require('../../../game-core/gameSession')
const { matchmakingQueue, gameRooms, playerRoom, pendingRoomTransitions } = require('../core/state')
const { getSupportedRoomSizes } = require('../core/config')
const { BOOT_EPOCH } = require('../core/constants')
const { getAdmissionAttempt, countRoomOccupancy } = require('./attempts')

// 서비스가 socket을 거꾸로 require 안 하게 하려고 함수로 넘김
const inviteRoomReaders = {
    bootEpoch: BOOT_EPOCH,

    // 보내는 사람이 지금 있는 방 id
    getRoomIdForUser: (uuid) => playerRoom.get(uuid) ?? null,

    // 초대에 실을 방 정보 (인원엔 입장 중 자리도 셈)
    describeRoomForInvite: (roomId) => {
        const room = gameRooms.get(roomId)
        if (!room) return null
        const maxPlayers = room.settings?.maxPlayers ?? getSupportedRoomSizes()[0]
        return {
            roomId: room.id,
            roomInstanceId: room.instanceId ?? room.id,
            hostUuid: room.hostUuid,
            occupancy: countRoomOccupancy(room),
            maxPlayers,
            isFull: countRoomOccupancy(room) >= maxPlayers,
        }
    },

    // 받는 사람이 초대 받을 수 있는지: 판·방·줄·방 전환·입장 중이면 못 받음
    describeReceiverAvailability: (uuid) => {
        // 판에 있으면 거절 (기권한 판은 통과, 끝난 결과 화면은 아직 판에 있는 것으로 봄)
        const routing = gameSession.getActiveSessionRoutingInfo(uuid)
        if (routing && !gameSession.isForfeitedFromSession(routing.gameId, uuid)) {
            return { available: false, code: 'RECEIVER_IN_GAME' }
        }
        if (playerRoom.has(uuid)) return { available: false, code: 'RECEIVER_IN_ROOM' }
        if (matchmakingQueue.has(uuid)) return { available: false, code: 'RECEIVER_IN_QUEUE' }
        if (pendingRoomTransitions.has(uuid)) return { available: false, code: 'RECEIVER_TRANSITIONING' }
        if (getAdmissionAttempt(uuid)) return { available: false, code: 'RECEIVER_TRANSITIONING' }
        return { available: true, code: null }
    },
}

module.exports = { inviteRoomReaders }
