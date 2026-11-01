// 방 만들기 파일
// 방 만들기 요청 받기 + 자리 잡은 뒤 실제로 만들기 (지도 09)
const kickReceiptStore = require('../../kickReceiptStore')
const crypto = require('crypto')
const { rejectIfInActiveGame, isRoomCodeReserved } = require('./guards')
const { playerRoom, pendingRoomTransitions, matchmakingQueue, gameRooms } = require('../core/state')
const { validateCreateRoomPayload } = require('../../../utils/createRoomValidation')
const { validateCreateRoomRoleComposition } = require('../../../game-core/roleComposition')
const { acquireRoomTransition, getRoomTransitionGeneration, releaseRoomTransition } = require('./transition')
const { deps } = require('../core/deps')
const { loadRoomParticipantProfile, emitPublicRoomList, buildRoomPayload } = require('../room/view')
const { INITIAL_SETTINGS_VERSION } = require('../settings/receipts')
const { leaveSocketRoomSafely } = require('../room/membership')
const { generateUniqueRoomCode } = require('../../../utils/roomCode')
const { notifyEndedSessionPartyOfMatchingRoom } = require('./party')
const { autoJoinEndedSessionPartyToRoom } = require('./join')

// 방 만들기 요청: 게임 중이면 거절, 처리 중 잠금 걸고 진행
function handleCreateRoom(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return

    if (rejectIfInActiveGame(uuid, (error) => callback({ ok: false, ...error }))) return

    if (playerRoom.has(uuid)) {
        callback({ ok: false, message: '이미 참여 중인 방이 있습니다.' })
        return
    }
    if (pendingRoomTransitions.has(uuid)) {
        callback({ ok: false, message: '이미 처리 중인 요청이 있습니다.' })
        return
    }
    if (matchmakingQueue.has(uuid)) {
        callback({ ok: false, message: '매칭 대기열에 남아있는 요청이 있습니다. 먼저 취소해주세요.' })
        return
    }

    const validation = validateCreateRoomPayload(payload)
    if (!validation.ok) {
        callback({ ok: false, message: validation.message })
        return
    }

    const roleComposition = validateCreateRoomRoleComposition(payload, validation.value.settings)
    if (!roleComposition.ok) {
        callback({ ok: false, message: roleComposition.message })
        return
    }
    const validatedValue = {
        accessType: validation.value.accessType,
        settings: { ...validation.value.settings, ...roleComposition.value },
    }

    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) {
        callback({ ok: false, message: '이미 처리 중인 요청이 있습니다.' })
        return
    }
    const generationAtReservation = getRoomTransitionGeneration(uuid)

    handleCreateRoomAfterReservation(io, socket, uuid, validatedValue, callback, generationAtReservation, transitionToken)
}

// 방 만들기: 설정 검사 → 코드 만들기 → 방 열기 → 끝난 판 사람들 부르기
async function handleCreateRoomAfterReservation(io, socket, uuid, { accessType, settings }, callback, generationAtReservation, transitionToken) {
    let roomId = null
    let joined = false
    let room = null

    try {
        const [user, accountProfile] = await Promise.all([
            deps.userRepository.findByUuid(uuid),
            loadRoomParticipantProfile(uuid),
        ])
        if (!user) {
            callback({ ok: false, message: '사용자 정보를 찾을 수 없습니다.' })
            return
        }

        if (playerRoom.has(uuid)) {
            callback({ ok: false, message: '이미 참여 중인 방이 있습니다.' })
            return
        }

        if (getRoomTransitionGeneration(uuid) !== generationAtReservation) {
            callback({ ok: false, message: '게임 세션이 종료되어 요청을 처리하지 못했습니다. 다시 시도해주세요.' })
            return
        }

        if (!socket.connected) {
            callback({ ok: false, message: '연결이 끊어져 방을 생성하지 못했습니다.' })
            return
        }

        roomId = crypto.randomUUID()
        room = {
            id: roomId,
            instanceId: crypto.randomUUID(),
            code: null,
            hostUuid: uuid,
            title: `${user.nickname}의 방`,
            accessType,
            players: new Map([[uuid, { uuid, nickname: user.nickname, isReady: false, ...accountProfile }]]),
            settings,
            settingsVersion: INITIAL_SETTINGS_VERSION,
        }

        await socket.join(roomId)
        joined = true

        if (!socket.connected) {
            await leaveSocketRoomSafely(socket, roomId, '[방 생성 정리 실패]')
            joined = false
            callback({ ok: false, message: '연결이 끊어져 방을 생성하지 못했습니다.' })
            return
        }

        if (getRoomTransitionGeneration(uuid) !== generationAtReservation) {
            await leaveSocketRoomSafely(socket, roomId, '[방 생성 정리 실패]')
            joined = false
            callback({ ok: false, message: '게임 세션이 종료되어 요청을 처리하지 못했습니다. 다시 시도해주세요.' })
            return
        }

        const code = generateUniqueRoomCode(gameRooms, { isReserved: isRoomCodeReserved })
        if (!code) {
            await leaveSocketRoomSafely(socket, roomId, '[방 생성 정리 실패]')
            joined = false
            callback({ ok: false, message: '방 코드를 생성하지 못했습니다. 다시 시도해주세요.' })
            return
        }
        room.code = code

        room.players.get(uuid).membershipId = kickReceiptStore.nextMembershipId()
        gameRooms.set(roomId, room)
        playerRoom.set(uuid, roomId)
        socket.data.activeRoomId = roomId
        emitPublicRoomList(io)
    } catch (err) {
        console.error('[방 생성 에러]', err)
        if (joined && roomId) {
            await leaveSocketRoomSafely(socket, roomId, '[방 생성 정리 실패]')
        }
        callback({ ok: false, message: '방을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.' })
        return
    } finally {
        releaseRoomTransition(uuid, transitionToken)
    }

    try {
        callback({ ok: true, room: buildRoomPayload(room) })
        notifyEndedSessionPartyOfMatchingRoom(io, uuid, room)
    } catch (ackError) {
        console.error('[방 생성 ack 실패]', ackError)
    }
    try {
        await autoJoinEndedSessionPartyToRoom(io, uuid, room)
    } catch (err) {
        console.error('[종료된 판 파티 자동 재입장 일괄 실패]', err)
    }
}

module.exports = {
    handleCreateRoom,
    handleCreateRoomAfterReservation,
}
