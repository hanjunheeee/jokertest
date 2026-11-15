// 판 끝 뒤 같은 방 파일
// 판 끝나면 같은 코드·설정·추방 횟수로 빈 대기방 다시 열기 + 방장 자리 남겨 두기 + 180초 끝 정리 + "대기방으로"(return_to_room) 받기 (계획 2-1)
// 판 끝 정리(gameSession departure/end.js)가 열기·180초 끝·판 지울 때를 부르고, registerEvents가 return_to_room에 붙임
const crypto = require('crypto')
const cluster = require('../../../cluster')
const gameSession = require('../../../game-core/gameSession')
const kickReceiptStore = require('../../kickReceiptStore')
const channelMembership = require('../../channelMembership')
const { ROOM_JOIN_ERROR_CODES } = require('../../roomJoinErrors')
const { gameRooms, playerRoom, pendingRoomTransitions, matchmakingQueue } = require('../core/state')
const { BOOT_EPOCH } = require('../core/constants')
const { getSupportedRoomSizes } = require('../core/config')
const { INIT_SETTINGS_VERSION, getSettingsVersion } = require('../settings/receipts')
const { countRoomOccupancy } = require('../admission/attempts')
const { acquireRoomTransition, releaseRoomTransition } = require('../join/transition')
const { rejectIfDeserted, isRoomCodeReserved } = require('../join/guards')
const { forgetStartedRoom } = require('../join/startedMarks')
const { createJoinChannelGuard } = require('../join/joinCommit')
const { handOffHeldRoomCode, releaseHeldRoomCode } = require('../cluster/roomDirectory')
const { generateUniqueRoomCode } = require('../../../utils/roomCode')
const { buildRoomPayload, computeCanStart, emitPublicRoomList } = require('./view')
const { disposeRoom } = require('./dispose')
const { restoreRoomKicks, isKickLimitReached, KICK_LIMIT_MESSAGE } = require('./kickLimit')

// "대기방으로" 거절 코드 중 입장 거절 표에 없는 것 (Node가 비우는 중이라 방을 안 염)
const RETURN_TO_ROOM_ERROR_CODES = Object.freeze({
    NODE_DRAINING: 'NODE_DRAINING',
})

// 거절 문구 (화면은 code로 나누고, 없으면 이 문구)
const RETURN_MESSAGES = Object.freeze({
    INVALID_REQUEST: '잘못된 요청입니다.',
    DISCONNECTED: '연결이 끊어져 대기방으로 돌아가지 못했습니다.',
    ALREADY_IN_ROOM: '이미 참여 중인 방이 있습니다.',
    REQUEST_IN_PROGRESS: '이미 처리 중인 요청이 있습니다.',
    IN_MATCHMAKING_QUEUE: '매칭 대기열에 남아있는 요청이 있습니다. 먼저 취소해주세요.',
    SESSION_ENDED: '게임 결과 화면이 닫혀 대기방으로 돌아갈 수 없습니다.',
    ROOM_NOT_FOUND: '대기방이 없어졌습니다.',
    NODE_DRAINING: '서버 점검 준비 중이라 대기방으로 돌아갈 수 없습니다.',
    ROOM_FULL: '방이 가득 찼습니다.',
    INTERNAL_ERROR: '대기방으로 돌아가지 못했습니다. 잠시 후 다시 시도해주세요.',
})

// 끝난 판 → 다시 연 방 (판 id → { roomId, instanceId }), "대기방으로"가 찾고 180초 끝에 지움
const returnRoomsByGameId = new Map()

// Node가 비우는 중이라 방을 안 연 판 id ("대기방으로" 거절 이유 구분용, 판이 지워지거나 180초 끝에 지움)
const skippedGameIds = new Set()

// 끝난 판에서 한 사람 빼기 (gameSession departure/end.js가 넣어 줌, 서로 require 하면 고리가 생겨서)
const endedSessionHooks = { leaveEndedSession: null }

// 끝난 판 빼기 함수 넣기 (end.js가 불러올 때 한 번)
function setEndedSessionHooks(hooks) {
    Object.assign(endedSessionHooks, hooks)
}

// 방장 자리를 남겨 두는 중인지 (원래 방장이 아직 안 들어왔고 180초 안)
function isHostReserved(room) {
    return typeof room?.returnHold?.reservedHostUuid === 'string'
}

// 정원에서 더 빼 둘 자리 수: 방장 자리를 남겨 두는 중이면 원래 방장 말고는 1칸 덜 들어옴 (결정 [임시] 3)
// 예: 정원 7·5명 앉음·방장 자리 남김 → 다른 사람은 5 + 1 >= 7 아니라 들어옴, 6명 앉으면 막힘
function reservedSeatsFor(room, uuid) {
    return isHostReserved(room) && room.returnHold.reservedHostUuid !== uuid ? 1 : 0
}

// 방장이 빠진 뒤 다음 방장: 방장 자리를 남겨 두는 중이면 비워 둠(null), 아니면 먼저 들어온 사람, 아무도 없으면 null
function nextHostAfterLeave(room) {
    if (isHostReserved(room)) return null
    return room.players.keys().next().value ?? null
}

// 방장 칸이 비어 있고 남겨 둔 자리도 없으면 들어오는 사람이 방장 (빈 채 남은 같은 방에 처음 들어온 사람), 바꿨으면 true
function claimHostIfVacant(room, uuid) {
    if (room.hostUuid != null || isHostReserved(room)) return false
    room.hostUuid = uuid
    return true
}

// 이 판이 다시 연 방이 있는지 (판이 지워져도 180초 시계는 방 때문에 계속 돎)
function hasReturnRoom(gameId) {
    return returnRoomsByGameId.has(gameId)
}

// 판 id로 다시 연 방 찾기 (지워졌거나 같은 id 다른 방이면 null)
function findReturnRoom(gameId) {
    const entry = returnRoomsByGameId.get(gameId)
    if (!entry) return null
    const room = gameRooms.get(entry.roomId)
    return room && room.instanceId === entry.instanceId ? room : null
}

// 판 Node가 비우는 중인지 (배포 때만, 방을 다시 열면 비우기가 최대 180초 늘어남)
function isNodeDraining() {
    return cluster.isEnabled() && cluster.nodes.isDraining() === true
}

// 판이 끝날 때의 방장이 아직 결과 화면에 있으면 그 사람 자리 남겨 둠 (결정 [임시] 8), 이미 나갔으면 null
function pickReservedHost(session) {
    const hostUuid = session.hostUuid
    if (typeof hostUuid !== 'string' || !hostUuid) return null
    return gameSession.getEndedGameId(hostUuid) === session.id ? hostUuid : null
}

// 같은 코드를 이 Node 다른 방이 쓰고 있으면 새 코드 (있으면 안 되는 일, 로그 남김)
function pickReturnCode(code) {
    if (![...gameRooms.values()].some((room) => room.code === code)) return code
    console.warn('[같은 방 다시 열기] 방 코드가 이미 다른 방에 있어 새 코드로 엶', { code })
    return generateUniqueRoomCode(gameRooms, { isReserved: isRoomCodeReserved })
}

// 판 끝 순간 같은 코드·설정·추방 횟수로 빈 대기방 다시 열기 (방 id는 새로 뽑음, 같은 방 판 검사와 안 부딪히게)
// 방장 칸은 비우고 원래 방장 자리를 180초 남겨 둠, 공개 방이라도 0명이면 목록엔 안 보임 (room/view.js)
// 같은 판에 두 번 불려도 한 번만, 열었으면 방, 안 열었으면 null
function reopenRoomAfterGame(io, session) {
    if (!session?.id || returnRoomsByGameId.has(session.id) || skippedGameIds.has(session.id)) return null
    const source = session.returnRoomSource
    // 방 정보가 없거나 비우는 중인 Node·코드를 못 뽑으면 안 엶 ("대기방으로"는 이유 알려 주고 거절, 결과 화면엔 "로비로"만)
    const code = source?.code && source.settings && !isNodeDraining() ? pickReturnCode(source.code) : null
    if (!code) {
        if (source?.code) skippedGameIds.add(session.id)
        releaseHeldRoomCode(session.roomId)
        return null
    }
    const room = {
        id: crypto.randomUUID(),
        instanceId: crypto.randomUUID(),
        code,
        hostUuid: null,
        title: source.title || '대기방',
        accessType: source.accessType,
        players: new Map(),
        settings: structuredClone(source.settings),
        settingsVersion: INIT_SETTINGS_VERSION,
        // 180초 끝까지: 빈 방도 유지, 원래 방장 자리 남김
        returnHold: {
            gameId: session.id,
            closesAt: gameSession.getResultClosesAt(session) ?? Date.now() + gameSession.RESULT_SCREEN_MS,
            reservedHostUuid: pickReservedHost(session),
        },
    }
    restoreRoomKicks(room, source.kickCounts)
    gameRooms.set(room.id, room)
    returnRoomsByGameId.set(session.id, { roomId: room.id, instanceId: room.instanceId })
    // 옛 방 "시작됨" 표시 지움 (이 방이 빈 채 없어진 뒤엔 "방 없음"으로 답하게)
    forgetStartedRoom(source.code, session.roomId, session.id)
    // Node 여러 개: 판 동안 잡아 둔 코드 키를 이 방으로 넘김 (코드가 바뀌었으면 옛 키만 놓음)
    if (code === source.code) handOffHeldRoomCode(session.roomId, room)
    else releaseHeldRoomCode(session.roomId)
    emitPublicRoomList(io)
    return room
}

// 방장 바뀜·남겨 둔 방장 자리 끝 알림 (방 사람들에게, 실패는 로그만)
function emitHostChanged(io, room) {
    const { id: roomId, hostUuid } = room
    const reservedHostUuid = room.returnHold?.reservedHostUuid ?? null
    try {
        channelMembership.emitToChannel(io, roomId, 'host_changed', {
            hostUuid, reservedHostUuid, canStart: computeCanStart(room), roomId,
            roomInstanceId: room.instanceId ?? null, bootEpoch: BOOT_EPOCH, settingsVersion: getSettingsVersion(room),
        })
    } catch (err) {
        console.error('[방장 변경 방송 실패]', err)
    }
}

// 남겨 둔 방장 자리 끝내기: 방장 칸이 비었으면 먼저 들어온 사람이 방장, 아무도 없으면 다음에 들어오는 사람이 방장
// 끝냈으면 true (원래 방장이 "로비로"·결과 화면 끊김·180초 지남)
function endHostReservation(io, room) {
    if (!isHostReserved(room)) return false
    room.returnHold.reservedHostUuid = null
    if (room.players.size === 0) return true
    if (room.hostUuid == null) room.hostUuid = room.players.keys().next().value
    emitHostChanged(io, room)
    emitPublicRoomList(io)
    return true
}

// 이 사람이 원래 방장으로 자리를 남겨 둔 방이 있으면 그 자리 끝냄 (끝난 판에서 빠질 때, room/sessionCleanup이 부름)
function releaseReservedHostFor(io, uuid) {
    for (const gameId of returnRoomsByGameId.keys()) {
        const room = findReturnRoom(gameId)
        if (room?.returnHold?.reservedHostUuid === uuid) endHostReservation(io, room)
    }
}

// 판 끝 180초: 방장 자리 남겨 두기 끝, 아무도 없으면 방 없앰(코드 풀림), 한 명이라도 있으면 그대로 둠
// 결과 화면 사람 내보내기는 gameSession departure/end.js가 같은 시계에서 먼저 함
function closeReturnHold(io, gameId) {
    skippedGameIds.delete(gameId)
    const room = findReturnRoom(gameId)
    returnRoomsByGameId.delete(gameId)
    if (!room) return
    endHostReservation(io, room)
    room.returnHold = null
    if (room.players.size === 0) disposeRoom(room.id, 'ROOM_GONE')
    emitPublicRoomList(io)
}

// 판이 장부에서 지워질 때: 다시 연 방이 있으면 180초 시계를 그대로 둠 → true
// 없으면(점검 강제 종료·비우는 중·방 정보 없음) 판 동안 잡아 둔 코드 놓고 false
function settleReturnOnSessionGone(session) {
    if (!session?.id) return false
    skippedGameIds.delete(session.id)
    if (returnRoomsByGameId.has(session.id)) return true
    releaseHeldRoomCode(session.roomId)
    return false
}

// 답 한 번만, 답이 던져도 처리는 계속
function respondOnce(callback) {
    let called = false
    return (payload) => {
        if (called) return
        called = true
        try { callback(payload) } catch (ackErr) { console.error('[대기방으로 돌아가기 ack 실패]', ackErr) }
    }
}

// 거절 답 모양 { ok:false, code, message }
function returnFailure(code, message = RETURN_MESSAGES[code] ?? RETURN_MESSAGES.INTERNAL_ERROR) {
    return { ok: false, code, message }
}

// 들어갈 수 있는지: 결과 화면에 아직 있음 → 방 있음 → 3번 추방 아님 → 자리 있음(방장 자리 1칸 빼고) 순, 통과면 null
function checkReturnable(uuid, gameId, room) {
    if (!gameSession.getEndedSeatProfile(gameId, uuid)) return returnFailure(ROOM_JOIN_ERROR_CODES.SESSION_ENDED)
    if (!room) {
        return skippedGameIds.has(gameId)
            ? returnFailure(RETURN_TO_ROOM_ERROR_CODES.NODE_DRAINING)
            : returnFailure(ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND)
    }
    if (isKickLimitReached(room, uuid)) return returnFailure(ROOM_JOIN_ERROR_CODES.KICKED_TOO_MANY_TIMES, KICK_LIMIT_MESSAGE)
    const maxPlayers = room.settings?.maxPlayers ?? getSupportedRoomSizes()[0]
    if (countRoomOccupancy(room, uuid) + reservedSeatsFor(room, uuid) >= maxPlayers) return returnFailure(ROOM_JOIN_ERROR_CODES.ROOM_FULL)
    return null
}

// 사람 쪽 검사: 연결·탈주 대기·이미 방·처리 중·줄, 걸리면 거절 답 (통과면 null)
// 채널 넣은 뒤 다시 볼 땐 내 잠금이 꽂혀 있어 처리 중 검사는 건너뜀 (holdsLock)
function checkBeforeReturn(socket, uuid, { holdsLock = false } = {}) {
    if (socket.data?.user?.uuid !== uuid || socket.connected === false) return returnFailure(ROOM_JOIN_ERROR_CODES.DISCONNECTED)
    let deserted = null
    if (rejectIfDeserted(uuid, (error) => { deserted = { ok: false, ...error } })) return deserted
    if (playerRoom.has(uuid)) return returnFailure(ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM)
    if (!holdsLock && pendingRoomTransitions.has(uuid)) return returnFailure(ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS)
    if (matchmakingQueue.has(uuid)) return returnFailure(ROOM_JOIN_ERROR_CODES.IN_MATCHMAKING_QUEUE)
    return null
}

// 자리 확정: 명단 넣기(준비 안 됨, 판에서 옮겨 온 닉네임·프로필) → 방장 정하기 → 끝난 판에서 빼기, await 없음
// 원래 방장이면 방장 칸에 앉고 자리 남기기 끝, 방장 칸이 비어 있고 남긴 자리도 없으면 이 사람이 방장
function seatReturningPlayer(io, socket, uuid, gameId, room, channel) {
    const profile = gameSession.getEndedSeatProfile(gameId, uuid)
    const { nickname, accountProfilePhotoId, accountProfileBorderId } = profile
    const membershipId = kickReceiptStore.nextMembershipId()
    const player = { uuid, nickname, isReady: false, membershipId, accountProfilePhotoId, accountProfileBorderId }
    room.players.set(uuid, player)
    playerRoom.set(uuid, room.id)
    socket.data.activeRoomId = room.id
    channel.release()

    const wasReservedHost = room.returnHold?.reservedHostUuid === uuid
    if (wasReservedHost) {
        room.returnHold.reservedHostUuid = null
        room.hostUuid = uuid
    }
    const hostChanged = wasReservedHost || claimHostIfVacant(room, uuid)

    // 끝난 판 묶임 풂 (판 채널 떼기·마지막이면 판 끝 정리), 실패해도 자리는 그대로
    try { endedSessionHooks.leaveEndedSession?.(io, uuid, 'RETURNED_TO_ROOM', gameId, { socket }) } catch (err) {
        console.error('[대기방으로 돌아가기 끝난 판 정리 실패]', err)
    }
    return { player, hostChanged }
}

// 들어온 걸 방 사람들·공개 목록에 알림 (방장 바뀌었으면 그것도), 하나 실패해도 나머지는 보냄
function announceReturn(io, socket, room, { player, hostChanged }) {
    try {
        channelMembership.emitToChannel(
            io, room.id, 'player_joined_room',
            { player: { ...player }, canStart: computeCanStart(room) },
            { senderSocket: socket },
        )
    } catch (err) {
        console.error('[대기방으로 돌아가기 방송 실패]', err)
    }
    if (hostChanged && room.players.size > 1) emitHostChanged(io, room)
    emitPublicRoomList(io)
}

// "대기방으로" (return_to_room { gameId }): 결과 화면 사람만, 누르면 방장 안 기다리고 바로 같은 방에 "준비 안 됨"으로 들어감
// 답: { ok:true, room } (방 내용 = room_joined와 같은 모양 + reservedHostUuid) / { ok:false, code, message }
// 이미 그 방에 앉아 있으면(두 번 누름·답 놓침) 그 방 그대로 답함, DB 안 부름
async function handleReturnToRoom(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    const respond = respondOnce(callback)
    const gameId = typeof payload?.gameId === 'string' ? payload.gameId.trim() : ''
    if (!gameId) {
        respond(returnFailure(ROOM_JOIN_ERROR_CODES.INVALID_REQUEST))
        return
    }
    const target = findReturnRoom(gameId)
    if (target && playerRoom.get(uuid) === target.id && target.players.has(uuid)) {
        respond({ ok: true, room: buildRoomPayload(target) })
        return
    }
    const rejected = checkBeforeReturn(socket, uuid) ?? checkReturnable(uuid, gameId, target)
    if (rejected) {
        respond(rejected)
        return
    }

    // 첫 await 전에 처리 중 잠금 (두 번 누름·다른 입장과 겹침 막기)
    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) {
        respond(returnFailure(ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS))
        return
    }
    // 확정 전엔 방 방송 안 받게 막고 채널 넣기 (코드 입장과 같은 방식)
    const channel = createJoinChannelGuard(io, socket, uuid)
    let committed = false
    try {
        channel.exclude(target.id)
        await socket.join(target.id)
        // 기다린 사이 방 사라짐·끊김·다른 방·결과 화면 닫힘·자리 다 참이면 채널 떼고 거절
        const again = findReturnRoom(gameId) !== target
            ? returnFailure(ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND)
            : (checkBeforeReturn(socket, uuid, { holdsLock: true }) ?? checkReturnable(uuid, gameId, target))
        if (again) {
            channel.detach(target.id)
            respond(again)
            return
        }
        const seated = seatReturningPlayer(io, socket, uuid, gameId, target, channel)
        committed = true
        respond({ ok: true, room: buildRoomPayload(target) })
        announceReturn(io, socket, target, seated)
    } catch (err) {
        console.error('[대기방으로 돌아가기 에러]', err)
        if (committed) return
        channel.detach(target.id)
        respond(returnFailure(ROOM_JOIN_ERROR_CODES.INTERNAL_ERROR))
    } finally {
        releaseRoomTransition(uuid, transitionToken)
        channel.release()
    }
}

// 시험용: 다시 연 방 기록 비우기
function __resetReturnRoomsForTests() {
    returnRoomsByGameId.clear()
    skippedGameIds.clear()
}

module.exports = {
    RETURN_TO_ROOM_ERROR_CODES,
    setEndedSessionHooks,
    isHostReserved,
    reservedSeatsFor,
    nextHostAfterLeave,
    claimHostIfVacant,
    hasReturnRoom,
    reopenRoomAfterGame,
    releaseReservedHostFor,
    closeReturnHold,
    settleReturnOnSessionGone,
    handleReturnToRoom,
    __resetReturnRoomsForTests,
}
