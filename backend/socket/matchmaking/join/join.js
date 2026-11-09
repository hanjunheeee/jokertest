// 방 입장 파일
// 코드 입장 흐름 + 끝난 판 사람 자동 입장 (지도 01·09), 앞 검사는 joinChecks, 다시 보기는 joinRecheck, 확정은 joinCommit
// matchmaking.js가 join_room_by_code에 붙임, 자동 입장은 join/create가, 공개방 입장은 publicRooms가 부름
const gameSession = require('../../../game-core/gameSession')
const { emitRoomJoinFailed } = require('./guards')
const { ROOM_JOIN_ERROR_CODES } = require('../../roomJoinErrors')
const { playerRoom, pendingRoomTransitions, matchmakingQueue, gameRooms } = require('../core/state')
const { releaseRoomTransition } = require('./transition')
const { findLiveSocket } = require('../room/membership')
const { deps } = require('../core/deps')
const { loadPlayerProfile } = require('../room/view')
const { isJoinLimitShared, takeSharedJoinAttempt } = require('./entryLimits')
const { isRoomRoutingEnabled, rejectIfRoomOnOtherNode } = require('../cluster/roomRouting')
const { getSupportedRoomSizes } = require('../core/config')
const { countRoomOccupancy } = require('../admission/attempts')
const { TOO_MANY_JOIN_ATTEMPTS, TOO_MANY_JOIN_ATTEMPTS_MESSAGE, reserveJoin, pickRoomForJoin } = require('./joinChecks')
const { rejectIfMovedOrEnded, rejectIfConnectionChanged, rejectIfRoomChanged } = require('./joinRecheck')
const { commitJoinedPlayer } = require('./joinCommit')

// 코드로 방 입장: 검사 → 잠금 → 방 찾기 → 프로필 → 채널 → 명단 추가 확정 → 알림
// expectedRoom 있으면 그 방 id·종류만 받음 (목록에서 고른 방·자동 입장·방 id 같이 보낸 요청)
// autoJoin = 서버가 끌어다 넣는 자동 입장 (본인이 고른 이동이 아니라 결과 화면 이동 표시 안 함)
// await는 전부 여기만: 도우미가 기다리면 거절 알림과 토큰 풀기 사이가 벌어짐
async function handleJoinRoomByCode(io, socket, uuid, roomCode, expectedRoom = null, { autoJoin = false } = {}) {
    // Node 여러 개: 시도 횟수를 Node끼리 합쳐 셈 (Redis 기다림이 있어 다른 검사보다 먼저, MN-019)
    if (!autoJoin && isJoinLimitShared() && !(await takeSharedJoinAttempt(uuid))) {
        emitRoomJoinFailed(socket, TOO_MANY_JOIN_ATTEMPTS, TOO_MANY_JOIN_ATTEMPTS_MESSAGE)
        return
    }
    const ctx = reserveJoin(io, socket, uuid, roomCode, { expectedRoom, autoJoin })
    if (!ctx) return
    const { channel, progress } = ctx

    try {
        // 방 찾기 먼저 (DB 읽기 전, 틀린 코드 시도가 DB를 두 번씩 안 부르게, BE-025), 기다리는 사이 사라지면 join 뒤 확인이 거름
        if (isRoomRoutingEnabled() && await rejectIfRoomOnOtherNode(socket, ctx.normalizedCode, expectedRoom)) return
        const room = pickRoomForJoin(socket, uuid, ctx.normalizedCode, expectedRoom)
        if (!room) return
        // 계정·프로필 읽기, 계정 없으면 거절
        const [user, accountProfile] = await Promise.all([deps.userRepository.findByUuid(uuid), loadPlayerProfile(uuid)])
        if (!user) {
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.USER_NOT_FOUND, '사용자 정보를 찾을 수 없습니다.')
            return
        }
        if (rejectIfMovedOrEnded(socket, uuid, ctx.generationAtReservation)) return
        channel.exclude(room.id)
        await socket.join(room.id)
        progress.joinedRoomId = room.id
        if (rejectIfConnectionChanged(io, socket, uuid, room, ctx)) return
        if (rejectIfRoomChanged(socket, uuid, room, ctx)) return
        commitJoinedPlayer(io, socket, uuid, room, { user, accountProfile }, ctx)
    } catch (err) {
        // 확정 전 실패면 붙은 채널 떼고 실패 알림
        // 확정 뒤면 명단에 이미 있어서 실패 알림 안 보냄 (명단엔 있는데 화면은 실패 보는 어긋남 막기)
        console.error('[코드 참가 에러]', err)
        if (progress.committed) return
        if (progress.joinedRoomId) channel.detach(progress.joinedRoomId)
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.INTERNAL_ERROR, '방에 참여하지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
        // 어느 길로 끝나든 토큰·방송 제외 정리
        releaseRoomTransition(uuid, ctx.transitionToken)
        channel.release()
    }
}

// 끝난 판 사람을 방장이 만든 다음 방에 자동 입장
// 그 끝난 판 방장이 만든 방일 때만 (방장 아닌 참가자가 만든 방에 남을 끌고 가지 않게, BE-005)
async function autoJoinPartyToRoom(io, hostUuid, room) {
    const ctx = gameSession.getEndedPartyContext(hostUuid)
    if (!ctx?.gameId || typeof room?.code !== 'string' || room.code.length === 0) return
    const gameId = ctx.gameId
    for (const participantUuid of ctx.participantUuids) {
        // 방이 없어졌거나 자리 다 찼으면 남은 사람은 조용히 그만 (넘친 사람 화면에 "가득 참" 실패 안 뜨게, BE-029)
        if (gameRooms.get(room.id) !== room) return
        if (countRoomOccupancy(room) >= (room.settings?.maxPlayers ?? getSupportedRoomSizes()[0])) return
        // 이미 방·처리 중·줄에 있거나 연결 없으면 조용히 건너뜀 (실패 알림 안 뜨게)
        if (playerRoom.has(participantUuid)) continue
        if (pendingRoomTransitions.has(participantUuid)) continue
        if (matchmakingQueue.has(participantUuid)) continue
        const participantSocket = findLiveSocket(io, participantUuid)
        if (!participantSocket) continue
        // 한 사람씩 코드 입장 흐름으로, 한 사람 실패가 나머지 안 막음
        try {
            await handleJoinRoomByCode(
                io,
                participantSocket,
                participantUuid,
                room.code,
                { roomId: room.id, accessType: room.accessType ?? 'code' },
                { autoJoin: true },
            )
        } catch (err) {
            console.error('[종료된 판 파티 자동 재입장 실패]', { participantUuid, gameId, err })
        }
    }
}

module.exports = {
    handleJoinRoomByCode,
    autoJoinPartyToRoom,
}
