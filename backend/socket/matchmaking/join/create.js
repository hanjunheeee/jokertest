// 방 만들기 파일
// 방 만들기 요청 받기 + 잠금 뒤 실제로 만들기, matchmaking.js가 create_room에 붙임 (지도 09)
const kickReceiptStore = require('../../kickReceiptStore')
const crypto = require('crypto')
const { rejectIfInGame, isRoomCodeReserved } = require('./guards')
const { playerRoom, pendingRoomTransitions, matchmakingQueue, gameRooms } = require('../core/state')
const { validateCreateRoomPayload } = require('../../../validations/room/create')
const { validateCreateRoomRoleComposition } = require('../../../game-core/core/rules/roleComposition')
const { acquireRoomTransition, getGeneration, releaseRoomTransition } = require('./transition')
const { deps } = require('../core/deps')
const { loadPlayerProfile, emitPublicRoomList, buildRoomPayload } = require('../room/view')
const { INIT_SETTINGS_VERSION } = require('../settings/receipts')
const { leaveSocketRoomSafely } = require('../room/membership')
const { generateUniqueRoomCode } = require('../../../utils/roomCode')
const { notifyPartyOfRoom } = require('./party')
const { autoJoinPartyToRoom } = require('./join')

// 방 만들기 요청: 게임 중이면 거절, 처리 중 잠금 걸고 진행
function handleCreateRoom(io, socket, uuid, payload, callback) {
    // 답 받을 곳 없으면 안 만듦 (만든 방을 못 알림)
    if (typeof callback !== 'function') return

    // 게임 중을 먼저 봄, 나가기로 못 푸는 상태라 그 이유를 알려 줌 (지도 09-②)
    if (rejectIfInGame(uuid, (error) => callback({ ok: false, ...error }))) return

    // 이미 방·처리 중·줄에 있으면 거절 (지도 09-②)
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

    // 설정 값은 허용 목록만, 역할 구성은 따로 검사 (방장은 payload 말고 소켓 uuid, 지도 09-①)
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

    // 첫 await 전에 처리 중 토큰 꽂고 세대 번호 기억 (지도 09-③④)
    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) {
        callback({ ok: false, message: '이미 처리 중인 요청이 있습니다.' })
        return
    }
    const generationAtReservation = getGeneration(uuid)

    createAfterReservation(io, socket, uuid, validatedValue, callback, generationAtReservation, transitionToken)
}

// 방 만들기: 계정 읽기 → 채널 넣기 → 코드 뽑기 → 방 등록 → 답 → 끝난 판 사람들 부르기
async function createAfterReservation(io, socket, uuid, { accessType, settings }, callback, generationAtReservation, transitionToken) {
    // 채널 붙었는지 기억 (실패 때 뗄 대상)
    let roomId = null
    let joined = false
    let room

    try {
        // 계정·프로필 읽기, 계정 없으면 거절
        const [user, accountProfile] = await Promise.all([
            deps.userRepository.findByUuid(uuid),
            loadPlayerProfile(uuid),
        ])
        if (!user) {
            callback({ ok: false, message: '사용자 정보를 찾을 수 없습니다.' })
            return
        }

        // 기다린 사이 다른 방 들어갔거나 판 끝 정리됐으면 거절 (지도 09-④)
        if (playerRoom.has(uuid)) {
            callback({ ok: false, message: '이미 참여 중인 방이 있습니다.' })
            return
        }

        if (getGeneration(uuid) !== generationAtReservation) {
            callback({ ok: false, message: '게임 세션이 종료되어 요청을 처리하지 못했습니다. 다시 시도해주세요.' })
            return
        }

        // 끊겼으면 안 만듦, 아무도 안 치우는 빈 방 막기 (지도 09-⑤)
        if (!socket.connected) {
            callback({ ok: false, message: '연결이 끊어져 방을 생성하지 못했습니다.' })
            return
        }

        // 방 객체: 방장·명단 = 나, 코드는 join 뒤에 뽑음 (아직 장부엔 안 넣음)
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
            settingsVersion: INIT_SETTINGS_VERSION,
        }

        await socket.join(roomId)
        joined = true

        // join 기다린 사이 끊김·판 끝 정리면 채널 떼고 거절 (지도 09-⑤④)
        if (!socket.connected) {
            await leaveSocketRoomSafely(socket, roomId, '[방 생성 정리 실패]')
            joined = false
            callback({ ok: false, message: '연결이 끊어져 방을 생성하지 못했습니다.' })
            return
        }

        if (getGeneration(uuid) !== generationAtReservation) {
            await leaveSocketRoomSafely(socket, roomId, '[방 생성 정리 실패]')
            joined = false
            callback({ ok: false, message: '게임 세션이 종료되어 요청을 처리하지 못했습니다. 다시 시도해주세요.' })
            return
        }

        // 코드 뽑기: 대기방·판·시작 표시가 잡은 코드 피함, 다 겹치면 실패 (지도 09-⑥)
        const code = generateUniqueRoomCode(gameRooms, { isReserved: isRoomCodeReserved })
        if (!code) {
            await leaveSocketRoomSafely(socket, roomId, '[방 생성 정리 실패]')
            joined = false
            callback({ ok: false, message: '방 코드를 생성하지 못했습니다. 다시 시도해주세요.' })
            return
        }
        room.code = code

        // 여기부터 진짜 바뀜: 코드 뽑기~방 등록 사이 await 없음, 같은 코드 두 방 막기 (지도 09-⑦)
        room.players.get(uuid).membershipId = kickReceiptStore.nextMembershipId()
        gameRooms.set(roomId, room)
        playerRoom.set(uuid, roomId)
        socket.data.activeRoomId = roomId
        emitPublicRoomList(io)
    } catch (err) {
        // 실패면 붙은 채널만 뗌 (장부엔 맨 끝에만 써서 남은 흔적 없음)
        console.error('[방 생성 에러]', err)
        if (joined && roomId) {
            await leaveSocketRoomSafely(socket, roomId, '[방 생성 정리 실패]')
        }
        callback({ ok: false, message: '방을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.' })
        return
    } finally {
        releaseRoomTransition(uuid, transitionToken)
    }

    // 성공 답은 try 밖에서, 답장이 던져도 "생성 실패"가 또 안 나감 (지도 09-⑨)
    try {
        callback({ ok: true, room: buildRoomPayload(room) })
        notifyPartyOfRoom(io, uuid, room)
    } catch (ackError) {
        console.error('[방 생성 ack 실패]', ackError)
    }
    // 끝난 판 사람들 자동 입장, 실패해도 만든 방은 그대로
    try {
        await autoJoinPartyToRoom(io, uuid, room)
    } catch (err) {
        console.error('[종료된 판 파티 자동 재입장 일괄 실패]', err)
    }
}

module.exports = {
    handleCreateRoom,
    createAfterReservation,
}
