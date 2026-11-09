// 초대 수락 명단 넣기 파일
// 영수증 저장 안에서 명단 넣기 + 영수증 뒤 다시 보기·되돌리기, admission/accept.js가 부름
const kickReceiptStore = require('../../kickReceiptStore')
const gameSession = require('../../../game-core/gameSession')
const { BOOT_EPOCH } = require('../core/constants')
const { playerRoom, gameRooms, roomAdmissionAttempts, publishedAdmissions } = require('../core/state')
const { ROOM_JOIN_ERROR_CODES } = require('../../roomJoinErrors')
const { getAdmissionAttempt, withAdmissionTimeout, countRoomOccupancy, releasePublished } = require('./attempts')
const { getGeneration } = require('../join/transition')
const { markPartyOriginObject } = require('../join/partyOrigin')
const { deps } = require('../core/deps')
const { getSupportedRoomSizes } = require('../core/config')
const { removePublished } = require('./release')
const { isCanonicalOrUnknown } = require('../room/membership')
const { detachUnlessSeated } = require('./acceptContext')

// 명단 넣기: 영수증 트랜잭션 안에서 불림, await 없이 다 다시 보고 넣음 (지도 23-⑨)
function createPublish(ctx, room, player) {
    const { io, socket, uuid, attempt } = ctx
    return () => {
        // 내 시도가 아직 살아 있고 같은 서버·같은 세대인지
        if (getAdmissionAttempt(uuid) !== attempt) return { ok: false, code: 'INTERRUPTED' }
        if (attempt.invalidated) return { ok: false, code: 'INTERRUPTED' }
        if (attempt.bootEpoch !== BOOT_EPOCH) return { ok: false, code: 'SERVER_RESTARTED' }
        if (getGeneration(uuid) !== ctx.generationAtRequest) return { ok: false, code: 'SESSION_ENDED' }
        // 같은 소켓·같은 계정·주인 소켓이고 채널에 붙어 있는지
        if (!socket.connected || attempt.socketId !== socket.id || socket.id !== ctx.socketIdAtRequest) {
            return { ok: false, code: 'DISCONNECTED' }
        }
        if (socket.data?.user?.uuid !== uuid) return { ok: false, code: 'DISCONNECTED' }
        if (!isCanonicalOrUnknown(io, uuid, socket, room.id)) return { ok: false, code: 'DISCONNECTED' }
        if (socket.rooms && !socket.rooms.has(room.id)) return { ok: false, code: 'CHANNEL_LOST' }
        // 같은 방 그대로·다른 방 없음·게임 중 아님 (기권한 판은 통과)·자리 남음
        const current = gameRooms.get(attempt.roomId)
        if (current !== room || (current.instanceId ?? current.id) !== attempt.roomInstanceId) {
            return { ok: false, code: ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND }
        }
        if (playerRoom.has(uuid)) return { ok: false, code: ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM }
        const routing = gameSession.getActiveSessionRoutingInfo(uuid)
        if (routing && !gameSession.isForfeitedFromSession(routing.gameId, uuid)) {
            return { ok: false, code: ROOM_JOIN_ERROR_CODES.ALREADY_IN_GAME }
        }
        if (countRoomOccupancy(current, uuid) >= (current.settings?.maxPlayers ?? getSupportedRoomSizes()[0])) {
            return { ok: false, code: ROOM_JOIN_ERROR_CODES.ROOM_FULL }
        }
        // 여기부터 진짜 바뀜: 명단에 넣고 시도를 published로, 되돌릴 권리 잡음
        player.membershipId = kickReceiptStore.nextMembershipId()
        attempt.publicationMembershipId = player.membershipId
        current.players.set(uuid, player)
        playerRoom.set(uuid, current.id)
        attempt.phase = 'published'
        publishedAdmissions.set(uuid, attempt)
        markPartyOriginObject(uuid, player)
        socket.data.activeRoomId = current.id
        return { ok: true }
    }
}

// 영수증 저장 + 명단 넣기 (DB가 차단 다시 봄), 남은 전체 시간만 기다림
function finalizeAcceptedEntry(ctx, room, player) {
    const { io, socket, uuid, inviteId, attemptId, attempt } = ctx
    const publish = createPublish(ctx, room, player)
    // 넣은 뒤 영수증 저장이 터지면 명단에서 다시 뺌
    const unpublish = () => removePublished(io, socket, attempt)
    return withAdmissionTimeout(
        deps.gameInviteService.finalizeAcceptedEntry({
            receiverId: uuid, inviteId, attemptId, bootEpoch: BOOT_EPOCH, publish, unpublish,
        }),
        Math.max(1, ctx.remaining()),
        'RECEIPT_TIMEOUT',
    )
}

// 붙었던 채널 떼기 (다른 길로 이미 앉았으면 그대로)
function detachJoinedChannel(ctx) {
    if (!ctx.joinedRoomId) return
    detachUnlessSeated(ctx.io, ctx.socket, ctx.uuid, ctx.joinedRoomId)
    ctx.joinedRoomId = null
}

// 영수증 실패: 넣었던 명단·시도·채널 되돌림, 결과 모름이면 다시 물으라고 답함
function rollbackFailedReceipt(ctx, finalized) {
    const { io, socket, uuid, attempt } = ctx
    if (attempt.phase === 'published') removePublished(io, socket, attempt)
    roomAdmissionAttempts.delete(uuid)
    detachJoinedChannel(ctx)
    ctx.respond({
        ok: false,
        code: finalized.code,
        unknown: finalized.unknown === true,
        message: finalized.unknown === true
            ? '입장 결과를 확인하지 못했습니다. 잠시 후 다시 확인해주세요.'
            : '방에 입장하지 못했습니다.',
    })
}

// 영수증 기다린 사이 시도·소켓·채널·방·자리 중 하나도 안 바뀌었는지
function isPublicationStillOwned({ io, socket, uuid, attempt, socketIdAtRequest }, room, seated) {
    const current = gameRooms.get(attempt.roomId)
    const stillCurrentAttempt = roomAdmissionAttempts.get(uuid) === attempt && !attempt.invalidated
    const stillOwnsPublication = publishedAdmissions.get(uuid) === attempt
    return !(!stillCurrentAttempt || !stillOwnsPublication
        || socket.id !== socketIdAtRequest
        || socket.data?.user?.uuid !== uuid
        || !socket.connected
        || !isCanonicalOrUnknown(io, uuid, socket, room.id)
        || (socket.rooms && typeof socket.rooms.has === 'function' && !socket.rooms.has(room.id))
        || current !== room || playerRoom.get(uuid) !== room.id || !seated
        || (attempt.publicationMembershipId !== undefined
            && seated.membershipId !== attempt.publicationMembershipId))
}

// 영수증 뒤 바뀐 게 있으면 되돌리고 결과 모름으로 답함 (다시 물으면 지금 명단 기준으로 답함)
function rollbackUnconfirmed(ctx) {
    const { io, socket, uuid, attempt } = ctx
    if (attempt.phase === 'published') removePublished(io, socket, attempt)
    if (roomAdmissionAttempts.get(uuid) === attempt) roomAdmissionAttempts.delete(uuid)
    releasePublished(attempt)
    detachJoinedChannel(ctx)
    ctx.respond({ ok: false, code: 'UNKNOWN', unknown: true, message: '입장 결과를 확인하지 못했습니다.' })
}

module.exports = {
    finalizeAcceptedEntry,
    rollbackFailedReceipt,
    isPublicationStillOwned,
    rollbackUnconfirmed,
}
