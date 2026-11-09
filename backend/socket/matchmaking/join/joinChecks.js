// 코드 입장 앞 검사 파일
// 처리 중 토큰 꽂기까지 + 들어갈 방 찾기, join/join.js가 부름 (전부 await 없음, 검사와 꽂기 사이 안 끊기게)
const { rejectIfInGame, emitRoomJoinFailed, describeVanishedRoom } = require('./guards')
const { ROOM_JOIN_ERROR_CODES } = require('../../roomJoinErrors')
const { playerRoom, pendingRoomTransitions, matchmakingQueue, gameRooms } = require('../core/state')
const { takeJoinAttempt, isJoinLimitShared } = require('./entryLimits')
const { acquireRoomTransition, getGeneration } = require('./transition')
const { markPartyOriginToken } = require('./partyOrigin')
const { isKickLimitReached, KICK_LIMIT_MESSAGE } = require('../room/kickLimit')
const { createJoinChannelGuard } = require('./joinCommit')

// 입장 시도 너무 많음 거절 코드 (roomJoinErrors 표에 없는 새 코드, 화면은 문구를 그대로 띄움)
const TOO_MANY_JOIN_ATTEMPTS = 'TOO_MANY_JOIN_ATTEMPTS'
const TOO_MANY_JOIN_ATTEMPTS_MESSAGE = '입장 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.'

// 토큰 꽂기 전 거절: 게임 중·빈 코드·시도 횟수·이미 방·처리 중·줄
// 통과면 다듬은 코드, 거절이면 실패 알림 보내고 null (예: ' AB12 ' → 'AB12')
function rejectBeforeReservation(socket, uuid, roomCode, { autoJoin }) {
    // 게임 중이면 거절 (지도 01-②)
    if (rejectIfInGame(uuid, ({ code, message, gameId }) =>
        emitRoomJoinFailed(socket, code, message, { gameId })
    )) return null

    // 코드 앞뒤 공백 다듬고 비었으면 거절
    const normalizedCode = String(roomCode ?? '').trim()
    if (!normalizedCode) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.CODE_REQUIRED, '방 코드를 입력해주세요.')
        return null
    }

    // 사람별 코드 입장 시도 횟수 제한 (서버가 끌어다 넣는 자동 입장은 안 셈, BE-025)
    if (!autoJoin && !isJoinLimitShared() && !takeJoinAttempt(uuid)) {
        emitRoomJoinFailed(socket, TOO_MANY_JOIN_ATTEMPTS, TOO_MANY_JOIN_ATTEMPTS_MESSAGE)
        return null
    }

    // 이미 방·처리 중·줄에 있으면 거절 (지도 01-②)
    if (playerRoom.has(uuid)) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM, '이미 참여 중인 방이 있습니다.')
        return null
    }
    if (pendingRoomTransitions.has(uuid)) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS, '이미 처리 중인 요청이 있습니다.')
        return null
    }
    if (matchmakingQueue.has(uuid)) {
        emitRoomJoinFailed(
            socket,
            ROOM_JOIN_ERROR_CODES.IN_MATCHMAKING_QUEUE,
            '매칭 대기열에 남아있는 요청이 있습니다. 먼저 취소해주세요.',
        )
        return null
    }
    return normalizedCode
}

// 앞 검사 → 처리 중 토큰 꽂기 → 세대 번호 기억, 이 입장 하나의 진행 묶음 돌려줌 (거절이면 알림 보내고 null)
function reserveJoin(io, socket, uuid, roomCode, { expectedRoom, autoJoin }) {
    const normalizedCode = rejectBeforeReservation(socket, uuid, roomCode, { autoJoin })
    if (normalizedCode === null) return null

    // 첫 await 전에 처리 중 토큰 꽂고 세대 번호 기억 (지도 01-③④)
    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS, '이미 처리 중인 요청이 있습니다.')
        return null
    }
    const generationAtReservation = getGeneration(uuid)
    // 결과 화면에서 본인이 시작한 입장이면 표시 (판 끝 정리가 이 요청·자리를 안 건드리게, known 1-16)
    if (!autoJoin) markPartyOriginToken(uuid, transitionToken)

    return {
        normalizedCode,
        expectedRoom,
        autoJoin,
        transitionToken,
        generationAtReservation,
        // 채널 붙은 방·명단 확정 여부 (실패 때 채널 뗄지 판단)
        progress: { joinedRoomId: null, committed: false },
        channel: createJoinChannelGuard(io, socket, uuid),
        // 요청 받은 소켓 id 기억 (그사이 새 탭이 소켓 바꾸면 거절용)
        socketIdAtRequest: socket.id,
    }
}

// 코드 방 id 받은 요청: 그 방만 (종류·코드도 맞아야 함), 못 찾으면 실패 알림 보내고 null
function findExpectedCodeRoom(socket, normalizedCode, expectedRoom) {
    const room = gameRooms.get(expectedRoom.roomId)
    // 그 방이 없으면 판 상태·시작 표시로 이유 고름 (지도 01-⑤)
    if (!room) {
        const vanished = describeVanishedRoom({ roomCode: normalizedCode, roomId: expectedRoom.roomId })
        if (vanished) {
            emitRoomJoinFailed(socket, ...vanished)
        } else {
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '방을 찾을 수 없습니다.')
        }
        return null
    }
    if (room.accessType !== 'code') {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '비밀 방을 찾을 수 없습니다.')
        return null
    }
    if (room.code !== normalizedCode) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH, '입장 코드가 올바르지 않습니다.')
        return null
    }
    return room
}

// 들어갈 방 찾기: 코드 방 id 받은 요청이면 그 방만, 아니면 코드로 찾음 (못 찾으면 실패 알림 보내고 null)
function findRoomForJoin(socket, normalizedCode, expectedRoom) {
    if (expectedRoom?.accessType === 'code') return findExpectedCodeRoom(socket, normalizedCode, expectedRoom)
    const room = [...gameRooms.values()].find((candidate) => candidate.code === normalizedCode)
    if (room) return room
    // 못 찾으면 이유 고르기 (지도 01-⑤): 판 있음 → 시작됨·끝남, 시작 표시만 → 끝남
    // 공개방 고른 요청 → 방 없음, 직접 친 코드 → 코드 틀림
    const vanished = describeVanishedRoom({ roomCode: normalizedCode })
    if (vanished) {
        emitRoomJoinFailed(socket, ...vanished)
        return null
    }
    if (expectedRoom) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '공개 방을 찾을 수 없습니다.')
        return null
    }
    emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH, '입장 코드와 일치하는 방이 없습니다.')
    return null
}

// 들어갈 방 찾고 이 방에서 3번 쫓겨난 사람은 거절 (쫓겨나는 동안은 방 밖이라 여기 한 번만 봄)
function pickRoomForJoin(socket, uuid, normalizedCode, expectedRoom) {
    const room = findRoomForJoin(socket, normalizedCode, expectedRoom)
    if (!room) return null
    if (isKickLimitReached(room, uuid)) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.KICKED_TOO_MANY_TIMES, KICK_LIMIT_MESSAGE)
        return null
    }
    return room
}

module.exports = {
    TOO_MANY_JOIN_ATTEMPTS,
    TOO_MANY_JOIN_ATTEMPTS_MESSAGE,
    reserveJoin,
    pickRoomForJoin,
}
