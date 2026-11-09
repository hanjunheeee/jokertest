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
const { markPartyOriginToken, markPartyOriginObject, isInEndedGame } = require('./partyOrigin')
const { isRoomRoutingEnabled, rejectCreateOnDrainingNode } = require('../cluster/roomRouting')
const { reserveRoomCode, releaseRoomCode } = require('../cluster/roomDirectory')

// 기다리는 사이 바뀌었을 때 거절 문구 (채널 넣기 전·뒤 둘 다 씀)
const DISCONNECTED_MESSAGE = '연결이 끊어져 방을 생성하지 못했습니다.'
const SESSION_ENDED_MESSAGE = '게임 세션이 종료되어 요청을 처리하지 못했습니다. 다시 시도해주세요.'

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
    // 내 Node가 비우는 중이면 다른 Node로 (MN-114)
    // 방에 든 사람은 위에서 거절, 결과 화면 방장은 파티가 따라오게 여기서 만듦
    if (!isInEndedGame(uuid) && rejectCreateOnDrainingNode(callback)) return

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
    // 결과 화면에서 시작한 방 만들기면 표시 (판 끝 정리가 이 요청·자리를 안 건드리게, known 1-16)
    markPartyOriginToken(uuid, transitionToken)

    // 안에서 다 잡지만 혹시 새는 거절도 로그만 (처리 안 된 거절로 서버가 꺼지지 않게, BE-032)
    createAfterReservation(io, socket, uuid, validatedValue, callback, generationAtReservation, transitionToken)
        .catch((err) => console.error('[방 생성 처리 에러]', err))
}

// 방 만들기: 계정 읽기 → 채널 넣기 → 코드 뽑기 → 방 등록 → 답 → 끝난 판 사람들 부르기
async function createAfterReservation(io, socket, uuid, { accessType, settings }, callback, generationAtReservation, transitionToken) {
    // 채널 붙었는지 기억 (실패 때 뗄 대상)
    let roomId = null
    let joined = false
    let room
    // Node 여러 개일 때 Redis에 미리 잡은 코드 (방 등록 못 하면 놓음)
    let reserved = null

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

        // 기다린 사이 다른 방·판 끝 정리·끊김이면 거절 (지도 09-④⑤)
        const beforeJoinMessage = checkBeforeJoin(socket, uuid, generationAtReservation)
        if (beforeJoinMessage) {
            callback({ ok: false, message: beforeJoinMessage })
            return
        }

        roomId = crypto.randomUUID()
        room = buildNewRoom(roomId, uuid, user, accountProfile, { accessType, settings })

        await socket.join(roomId)
        joined = true

        // Node 여러 개: 코드를 Redis에 먼저 잡음 (Node끼리 같은 코드 막기, 기다림이 있어 아래 확인보다 앞, MN-018)
        if (isRoomRoutingEnabled()) reserved = await reserveRoomCode(roomId, { isReserved: isRoomCodeReserved })

        // join 기다린 사이 끊김·판 끝 정리·코드 못 뽑음이면 채널 떼고 거절 (지도 09-⑤④⑥)
        const afterJoin = checkAfterJoin(socket, uuid, generationAtReservation, reserved)
        if (!afterJoin.code) {
            await leaveSocketRoomSafely(socket, roomId, '[방 생성 정리 실패]')
            joined = false
            callback({ ok: false, message: afterJoin.message })
            return
        }
        room.code = afterJoin.code

        registerRoom(io, socket, uuid, room)
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
        // 잡은 코드로 방을 못 만들었으면 놓음
        if (reserved?.claimed && gameRooms.get(roomId) !== room) releaseRoomCode(reserved.code, roomId)
    }

    await answerAndCallParty(io, uuid, room, callback)
}

// 채널 넣기 전 확인: 다른 방에 들어감 → 판 끝 정리 → 끊김 순, 걸리면 거절 문구 (통과면 null)
// 끊겼으면 안 만듦, 아무도 안 치우는 빈 방 막기
function checkBeforeJoin(socket, uuid, generationAtReservation) {
    if (playerRoom.has(uuid)) return '이미 참여 중인 방이 있습니다.'
    if (getGeneration(uuid) !== generationAtReservation) return SESSION_ENDED_MESSAGE
    if (!socket.connected) return DISCONNECTED_MESSAGE
    return null
}

// 방 객체: 방장·명단 = 나, 코드는 join 뒤에 뽑음 (아직 장부엔 안 넣음)
function buildNewRoom(roomId, uuid, user, accountProfile, { accessType, settings }) {
    return {
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
}

// 채널 넣은 뒤 확인 + 코드 뽑기: 통과면 { code }, 걸리면 { message }
// 코드 뽑기는 대기방·판·시작 표시가 잡은 코드 피함, 다 겹치면 실패 (지도 09-⑥)
// Node 여러 개면 잡아 둔 코드를 내 Node에서 한 번 더 확인만 함
function checkAfterJoin(socket, uuid, generationAtReservation, reserved) {
    if (!socket.connected) return { message: DISCONNECTED_MESSAGE }
    if (getGeneration(uuid) !== generationAtReservation) return { message: SESSION_ENDED_MESSAGE }
    const code = isRoomRoutingEnabled()
        ? reserved && generateUniqueRoomCode(gameRooms, { retry: 1, generator: () => reserved.code, isReserved: isRoomCodeReserved })
        : generateUniqueRoomCode(gameRooms, { isReserved: isRoomCodeReserved })
    return code ? { code } : { message: '방 코드를 생성하지 못했습니다. 다시 시도해주세요.' }
}

// 여기부터 진짜 바뀜: 코드 뽑기~방 등록 사이 await 없음, 같은 코드 두 방 막기 (지도 09-⑦)
function registerRoom(io, socket, uuid, room) {
    room.players.get(uuid).membershipId = kickReceiptStore.nextMembershipId()
    markPartyOriginObject(uuid, room.players.get(uuid))
    gameRooms.set(room.id, room)
    playerRoom.set(uuid, room.id)
    socket.data.activeRoomId = room.id
    emitPublicRoomList(io)
}

// 성공 답은 try 밖에서, 답장이 던져도 "생성 실패"가 또 안 나감 (지도 09-⑨)
async function answerAndCallParty(io, uuid, room, callback) {
    try {
        callback({ ok: true, room: buildRoomPayload(room) })
    } catch (ackError) {
        console.error('[방 생성 ack 실패]', ackError)
    }
    // 파티 알림은 답장과 따로 잡음 (답장이 던져도 끝난 판 사람들 알림은 감)
    try {
        notifyPartyOfRoom(io, uuid, room)
    } catch (err) {
        console.error('[종료된 판 파티 매칭 방 알림 실패]', err)
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
