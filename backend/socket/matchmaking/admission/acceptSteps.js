// 초대 수락 단계 검사 파일
// 초대 확인·자리 잡기·수락 기록 시작·프로필·채널 뒤 검사, admission/accept.js가 await 사이사이 부름
// 전부 await 없음 (확인과 바꾸기 사이 안 끊기게), 거절이면 답 보내고 null·true 돌려줌
const { BOOT_EPOCH } = require('../core/constants')
const { gameRooms, roomAdmissionAttempts } = require('../core/state')
const { ROOM_JOIN_ERROR_CODES } = require('../../roomJoinErrors')
const { getAdmissionAttempt, countRoomOccupancy, compensateAttempt } = require('./attempts')
const { markPartyOriginObject } = require('../join/partyOrigin')
const { deps } = require('../core/deps')
const { getSupportedRoomSizes } = require('../core/config')
const { loadPlayerProfile } = require('../room/view')
const { getTotalTimeoutMs } = require('./timeouts')
const { isKickLimitReached, KICK_LIMIT_MESSAGE } = require('../room/kickLimit')
const { isCanonicalOrUnknown } = require('../room/membership')
const { detachUnlessSeated } = require('./acceptContext')

// 엿본 초대로 방 고르기: 모르는 초대·다른 Node·재시작·방 없음·강퇴 한도·자리 없음이면 답하고 null
// elsewhere = 다른 Node 방 안내 (code·node, 수락 기록 전이라 DB 그대로)
function pickInvitedRoom({ uuid, respond }, peek, elsewhere) {
    if (!peek.known) {
        respond({ ok: false, code: 'INVITE_NOT_FOUND', message: '초대를 찾을 수 없습니다.' })
        return null
    }
    if (elsewhere) {
        respond({ ok: false, ...elsewhere })
        return null
    }
    if (peek.bootEpoch !== BOOT_EPOCH) {
        respond({ ok: false, code: 'SERVER_RESTARTED', message: '초대가 더 이상 유효하지 않습니다.' })
        return null
    }

    // 초대한 그 방(같은 인스턴스)이 아직 있고 자리 남았는지
    const room = gameRooms.get(peek.roomId)
    if (!room || (room.instanceId ?? room.id) !== peek.roomInstanceId) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, message: '방을 찾을 수 없습니다.' })
        return null
    }
    // 이 방에서 3번 쫓겨난 사람은 초대로도 못 들어옴 (코드 입장과 같은 규칙)
    if (isKickLimitReached(room, uuid)) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.KICKED_TOO_MANY_TIMES, message: KICK_LIMIT_MESSAGE })
        return null
    }
    const maxPlayers = room.settings?.maxPlayers ?? getSupportedRoomSizes()[0]
    if (countRoomOccupancy(room, uuid) >= maxPlayers) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.ROOM_FULL, message: '방이 가득 찼습니다.' })
        return null
    }
    return room
}

// 정원 본 직후 await 없이 자리 잡기, 코드 입장이 마지막 자리 못 채감 (지도 23-⑦)
function reserveSeat(ctx, room) {
    const { uuid } = ctx
    ctx.attempt = {
        attemptId: ctx.attemptId,
        accountUuid: uuid,
        inviteId: ctx.inviteId,
        roomId: room.id,
        room,
        roomInstanceId: room.instanceId ?? room.id,
        bootEpoch: BOOT_EPOCH,
        generation: ctx.generationAtRequest,
        socketId: ctx.socket.id,
        phase: 'reserved',
        expiresAt: ctx.startedAt + getTotalTimeoutMs(),
    }
    roomAdmissionAttempts.set(uuid, ctx.attempt)
    markPartyOriginObject(uuid, ctx.attempt)
}

// 초대를 이 시도로 수락 기록 시작 (DB, 이미 처리된 초대·차단이면 거절), 기다릴 약속 돌려줌
function startAcceptDecision({ uuid, inviteId, attemptId, attempt }) {
    // 끝남 표시: 되돌리기가 이 기록 끝난 뒤에 중단 기록하려고 봄
    attempt.decisionPromise = Promise.resolve(
        deps.gameInviteService.recordAcceptDecision({ receiverId: uuid, inviteId, attemptId, bootEpoch: BOOT_EPOCH }),
    ).then(
        (value) => { attempt.decisionSettled = true; return value },
        (error) => { attempt.decisionSettled = true; throw error },
    )
    // 시간 초과로 먼저 빠져도 처리 안 된 거절 경고 안 나게
    attempt.decisionPromise.catch(() => {})
    return attempt.decisionPromise
}

// 기다린 사이 시도가 없어졌으면 (나가기·끊김·판 끝 정리·방 없어짐·기한) 중단 답하고 true
function rejectIfAttemptLost({ uuid, attempt, respond }) {
    if (getAdmissionAttempt(uuid) === attempt) return false
    respond({ ok: false, code: 'INTERRUPTED', message: '입장이 중단되었습니다.' })
    return true
}

// 계정·프로필 같이 읽기 (예: [{ nickname: '가면1' }, { profileImage: ... }])
function loadAccountProfile(uuid) {
    return Promise.all([
        deps.userRepository.findByUuid(uuid),
        loadPlayerProfile(uuid),
    ])
}

// 계정 없거나 그사이 시도 없어짐·끊김이면 답하고 true
function rejectIfProfileUnusable({ uuid, socket, attempt, respond }, user) {
    // 수락은 이미 기록됐으니 시도 없애고 중단 기록도 남김 (초대가 수락·결과 모름으로 남지 않게)
    if (!user) {
        if (roomAdmissionAttempts.get(uuid) === attempt) {
            roomAdmissionAttempts.delete(uuid)
            attempt.invalidated = 'USER_NOT_FOUND'
            compensateAttempt(attempt, 'USER_NOT_FOUND')
        }
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.USER_NOT_FOUND, message: '사용자 정보를 찾을 수 없습니다.' })
        return true
    }
    if (getAdmissionAttempt(uuid) !== attempt || !socket.connected) {
        respond({ ok: false, code: 'INTERRUPTED', message: '입장이 중단되었습니다.' })
        return true
    }
    return false
}

// join 사이 소켓·신원 바뀜이나 새 탭 교체면 채널 떼고 (다른 길로 이미 앉았으면 그대로) 시도 없애고 중단 기록, true
function rejectIfSocketReplaced(ctx, room) {
    const { io, socket, uuid, attempt } = ctx
    if (socket.id === ctx.socketIdAtRequest
        && socket.data?.user?.uuid === uuid
        && isCanonicalOrUnknown(io, uuid, socket, room.id)) return false
    detachUnlessSeated(io, socket, uuid, room.id)
    ctx.joinedRoomId = null
    if (roomAdmissionAttempts.get(uuid) === attempt) roomAdmissionAttempts.delete(uuid)
    compensateAttempt(attempt, 'CANONICAL_SOCKET_REPLACED')
    ctx.respond({ ok: false, code: 'INTERRUPTED', message: '입장이 중단되었습니다.' })
    return true
}

module.exports = {
    pickInvitedRoom,
    reserveSeat,
    startAcceptDecision,
    rejectIfAttemptLost,
    loadAccountProfile,
    rejectIfProfileUnusable,
    rejectIfSocketReplaced,
}
