// 초대 수락 입장 파일
// accept_game_invite 받기, matchmaking.js가 붙임 (지도 23), 결과 다시 묻기는 admission/result.js
// 순서: 초대 확인 → 자리 잡기 → 수락 기록 → 채널 넣기 → 영수증 안에서 명단 넣기 (단계는 acceptSteps·acceptPublish)
const channelMembership = require('../../channelMembership')
const { BOOT_EPOCH } = require('../core/constants')
const { gameRooms, roomAdmissionAttempts } = require('../core/state')
const { compensateAttempt, releasePublished } = require('./attempts')
const { releaseRoomTransition } = require('../join/transition')
const { deps } = require('../core/deps')
const { computeCanStart, emitPublicRoomList, buildRoomPayload } = require('../room/view')
const { scheduleLateJoinCleanup, removePublished } = require('./release')
const { isRoomRoutingEnabled, findInviteRoomOwner } = require('../cluster/roomRouting')
const { createRespondOnce, reserveAcceptRequest, detachUnlessSeated } = require('./acceptContext')
const { pickInvitedRoom, reserveSeat, startAcceptDecision, rejectIfAttemptLost, loadAccountProfile, rejectIfProfileUnusable, rejectIfSocketReplaced } = require('./acceptSteps')
const { finalizeAcceptedEntry, rollbackFailedReceipt, isPublicationStillOwned, rollbackUnconfirmed } = require('./acceptPublish')

// 성공: 시도·되돌릴 권리·방송 제외 다 풂 (검증 다 끝난 뒤라 이제 방 방송 받음)
function finishAccept(ctx, room, seated) {
    const { io, socket, uuid, attempt } = ctx
    roomAdmissionAttempts.delete(uuid)
    releasePublished(attempt)
    ctx.releaseExclusion()

    // 방 사람들한테 (나 빼고) 새 사람, 목록 갱신, 나한테 방 정보
    channelMembership.emitToChannel(
        io, room.id, 'player_joined_room',
        { player: { ...seated }, canStart: computeCanStart(room) },
        { senderSocket: socket },
    )
    emitPublicRoomList(io)
    ctx.respond({ ok: true, room: buildRoomPayload(room), inviteId: ctx.inviteId, attemptId: ctx.attemptId })
}

// 터진 경우 되돌리기: 내 시도면 지우고 명단 되돌리고 초대에 중단 기록, 채널 떼고 답함
function failAccept(ctx, error) {
    const { io, socket, uuid, attempt } = ctx
    // 시간 초과는 예상한 실패라 로그 안 남김
    const timedOut = typeof error?.admissionTimeout === 'string'
    if (!timedOut) console.error('[초대 수락 처리 실패]', error)

    // 다른 곳이 없앤 시도면 그쪽이 이미 함
    const registered = roomAdmissionAttempts.get(uuid) === attempt
    const own = registered || (attempt && !attempt.invalidated) ? attempt : null
    if (own) {
        if (registered) roomAdmissionAttempts.delete(uuid)
        if (own.phase === 'published') removePublished(io, socket, own)
        compensateAttempt(own, timedOut ? error.admissionTimeout : 'ACCEPT_FAILED')
    }
    // 붙었던 채널 떼기 (다른 길로 이미 앉았으면 그대로)
    if (ctx.joinedRoomId) detachUnlessSeated(io, socket, uuid, ctx.joinedRoomId)
    // 시간 초과는 들어갔는지 모르니 결과 모름, 서비스가 낸 오류면 그 문구 그대로
    ctx.respond({
        ok: false,
        code: timedOut ? 'UNKNOWN' : (error?.code ?? 'INTERNAL_ERROR'),
        unknown: timedOut,
        message: error?.status && error?.message ? error.message : '방에 입장하지 못했습니다.',
    })
}

// 초대 수락 입장: 자리 미리 잡고 단계마다 시간 제한, 실패하면 되돌림
// await는 전부 여기만: 도우미가 기다리면 정원 확인과 자리 잡기, 답과 토큰 풀기 사이가 벌어짐
async function handleAcceptGameInvite(io, socket, uuid, payload, callback) {
    // 답 받을 곳 없으면 시작 안 함 (결과 못 알리는 입장 막기)
    if (typeof callback !== 'function') return
    const ctx = reserveAcceptRequest(io, socket, uuid, payload, createRespondOnce(callback))
    if (!ctx) return
    try {
        // 초대 먼저 엿보기 (DB): 내 초대인지·어느 방인지·서버 재시작 전 초대인지, 방이 다른 Node면 그 Node 찾기
        const peek = await ctx.step(deps.gameInviteService.getAttemptOutcome({ receiverId: uuid, inviteId: ctx.inviteId }), 'PEEK_TIMEOUT')
        const elsewhere = peek.known && isRoomRoutingEnabled() && !gameRooms.has(peek.roomId) ? await findInviteRoomOwner(peek, BOOT_EPOCH) : null
        const room = pickInvitedRoom(ctx, peek, elsewhere)
        if (!room) return
        reserveSeat(ctx, room)
        await ctx.step(startAcceptDecision(ctx), 'DECISION_TIMEOUT')
        if (rejectIfAttemptLost(ctx)) return
        const [user, accountProfile] = await ctx.step(loadAccountProfile(uuid), 'PROFILE_TIMEOUT')
        if (rejectIfProfileUnusable(ctx, user)) return

        ctx.excludeFromChannel(room.id)
        const joinPromise = Promise.resolve(socket.join(room.id))
        // join 시간 초과면 나중에 붙어도 떼게 예약하고 실패로 넘김
        try {
            await ctx.step(joinPromise, 'JOIN_TIMEOUT')
            ctx.joinedRoomId = room.id
        } catch (joinError) {
            scheduleLateJoinCleanup(io, socket, room.id, uuid, ctx.attempt, joinPromise)
            throw joinError
        }
        if (rejectIfSocketReplaced(ctx, room)) return

        const player = { uuid, nickname: user.nickname, isReady: false, ...accountProfile }
        const finalized = await finalizeAcceptedEntry(ctx, room, player)
        if (!finalized.ok) return rollbackFailedReceipt(ctx, finalized)
        const seated = room.players.get(uuid)
        if (!isPublicationStillOwned(ctx, room, seated)) return rollbackUnconfirmed(ctx)
        finishAccept(ctx, room, seated)
    } catch (error) {
        failAccept(ctx, error)
    } finally {
        // 어느 길로 끝나든 토큰·남은 시도·방송 제외 정리
        releaseRoomTransition(uuid, ctx.transitionToken)
        if (ctx.attempt && roomAdmissionAttempts.get(uuid) === ctx.attempt) roomAdmissionAttempts.delete(uuid)
        ctx.releaseExclusion()
    }
}

// 대기 시간은 admission/timeouts.js 읽기 함수로만 (값 복사하면 시험이 바꾼 값이 안 보임, BE-035)
module.exports = {
    handleAcceptGameInvite,
}
