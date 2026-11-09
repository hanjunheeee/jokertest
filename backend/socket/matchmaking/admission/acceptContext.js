// 초대 수락 준비 파일
// 처리 중 토큰 꽂기까지의 검사 + 수락 하나의 진행 묶음(답 한 번·시간 제한·방송 제외·채널 떼기), admission/accept.js가 씀
const channelMembership = require('../../channelMembership')
const { getStepTimeoutMs, getTotalTimeoutMs } = require('./timeouts')
const { rejectIfInGame } = require('../join/guards')
const { playerRoom, matchmakingQueue } = require('../core/state')
const { ROOM_JOIN_ERROR_CODES } = require('../../roomJoinErrors')
const { getAdmissionAttempt, nextAttemptId, withAdmissionTimeout } = require('./attempts')
const { acquireRoomTransition, getGeneration } = require('../join/transition')
const { markPartyOriginToken } = require('../join/partyOrigin')
const { isSeatedInRoom, detachSocketFromChannel, isCanonicalSocket, hasRoomMembership, hasLiveGameMembership } = require('../room/membership')

// 답은 한 번만, callback이 던져도 밖으로 안 샘
function createRespondOnce(callback) {
    let answered = false
    return (result) => {
        if (answered) return
        answered = true
        try { callback(result) } catch (ackError) { console.error('[초대 수락 ack 실패]', ackError) }
    }
}

// 요청 모양: 초대 id 글자만 받음 (방은 서버가 초대 행에서 찾음), 예: { inviteId: 'inv-1' } → 'inv-1', [] → null
function readInviteId(payload) {
    return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload.inviteId : null
}

// 게임·방·줄·다른 입장 시도 중이면 자리 잡기 전에 바로 거절하고 true (지도 23-⑤⑥, 수락 두 번 누름 막기)
function rejectBeforeReservation(uuid, respond) {
    if (rejectIfInGame(uuid, ({ code, message, gameId }) => respond({ ok: false, code, message, gameId }))) return true
    if (playerRoom.has(uuid)) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM, message: '이미 참여 중인 방이 있습니다.' })
        return true
    }
    if (matchmakingQueue.has(uuid)) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.IN_MATCHMAKING_QUEUE, message: '매칭 대기열에 남아있는 요청이 있습니다. 먼저 취소해주세요.' })
        return true
    }
    if (getAdmissionAttempt(uuid)) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS, message: '이미 처리 중인 요청이 있습니다.' })
        return true
    }
    return false
}

// 수락 하나의 진행 묶음: 시도 id·시작 시각·남은 시간·단계 기다리기·방송 제외
// attempt·joinedRoomId = 실패 때 되돌릴 대상 (단계가 채움)
function createAcceptContext(io, socket, uuid, { inviteId, respond, transitionToken, generationAtRequest }) {
    const attemptId = nextAttemptId()
    const startedAt = Date.now()
    // 전체 대기 중 남은 시간
    const remaining = () => Math.max(0, getTotalTimeoutMs() - (Date.now() - startedAt))
    const exclusionOwner = channelMembership.createChannelExclusionOwner('admission')
    let exclusionChannelId = null
    let exclusionSocketId = null
    return {
        io, socket, uuid, inviteId, respond, transitionToken, generationAtRequest, attemptId, startedAt, remaining,
        // 요청 받은 소켓 id 기억 (그사이 새 탭이 소켓 바꾸면 거절용)
        socketIdAtRequest: socket.id,
        attempt: null,
        joinedRoomId: null,
        // 단계 하나 기다리기: 단계 한도와 남은 시간 중 짧은 쪽, 다 썼으면 1ms로 바로 시간 초과
        step: (promise, code) => withAdmissionTimeout(
            promise, Math.min(getStepTimeoutMs(), remaining() || 1), code,
        ),
        // 채널 넣기 전에 방송 제외 걸기, 확정 전엔 방 방송 못 받게 (지도 23-⑧)
        excludeFromChannel(roomId) {
            exclusionChannelId = roomId
            exclusionSocketId = socket.id
            channelMembership.excludeSocketFromChannel(roomId, socket.id, exclusionOwner)
        },
        // 방송 제외 풀기, 건 적 있을 때 한 번만
        releaseExclusion() {
            if (exclusionChannelId === null || exclusionSocketId === null) return
            channelMembership.releaseChannelExclusion(exclusionChannelId, exclusionSocketId, exclusionOwner)
            exclusionChannelId = null
            exclusionSocketId = null
        },
    }
}

// 요청 모양 → 앞 거절 → 처리 중 토큰 꽂기 → 세대 번호 기억, 진행 묶음 돌려줌 (거절이면 답하고 null, await 없음)
function reserveAcceptRequest(io, socket, uuid, payload, respond) {
    const inviteId = readInviteId(payload)
    if (typeof inviteId !== 'string' || inviteId.length === 0) {
        respond({ ok: false, code: 'INVALID_REQUEST', message: '잘못된 요청입니다.' })
        return null
    }
    if (rejectBeforeReservation(uuid, respond)) return null
    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS, message: '이미 처리 중인 요청이 있습니다.' })
        return null
    }

    // 세대 번호 기억 (그사이 판 끝 정리되면 명단 넣기 거절)
    const generationAtRequest = getGeneration(uuid)
    // 결과 화면에서 시작한 수락이면 표시 (판 끝 정리가 이 입장을 안 끊게, known 1-16)
    markPartyOriginToken(uuid, transitionToken)
    return createAcceptContext(io, socket, uuid, { inviteId, respond, transitionToken, generationAtRequest })
}

// 실패 되돌리기 때 붙었던 채널 떼기, 다른 길로 이미 앉았으면 그대로 둠 (되돌리기 네 곳이 같이 씀)
function detachUnlessSeated(io, socket, uuid, channelId) {
    if (isSeatedInRoom(uuid, channelId)) return
    detachSocketFromChannel(socket, channelId, '[초대 입장 정리 실패]', {
        ownsChannel: () => isSeatedInRoom(uuid, channelId) && isCanonicalSocket(io, uuid, socket, channelId),
        keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
    })
}

module.exports = {
    createRespondOnce,
    reserveAcceptRequest,
    detachUnlessSeated,
}
