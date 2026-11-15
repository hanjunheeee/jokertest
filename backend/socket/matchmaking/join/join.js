// 방 입장 파일
// 코드 입장 흐름 (지도 01), 앞 검사는 joinChecks, 다시 보기는 joinRecheck, 확정은 joinCommit
// matchmaking.js가 join_room_by_code에 붙임, 공개방 입장은 publicRooms가 부름 (끝난 판 사람 자동 입장은 없어짐 → room/returnRoom.js "대기방으로")
const { emitRoomJoinFailed } = require('./guards')
const { ROOM_JOIN_ERROR_CODES } = require('../../roomJoinErrors')
const { releaseRoomTransition } = require('./transition')
const { deps } = require('../core/deps')
const { loadPlayerProfile } = require('../room/view')
const { claimHostIfVacant } = require('../room/returnRoom')
const { isJoinLimitShared, takeSharedJoinAttempt } = require('./entryLimits')
const { isRoomRoutingEnabled, rejectIfRoomOnOtherNode } = require('../cluster/roomRouting')
const { TOO_MANY_JOIN_ATTEMPTS, TOO_MANY_JOIN_ATTEMPTS_MESSAGE, reserveJoin, pickRoomForJoin } = require('./joinChecks')
const { rejectIfMovedOrEnded, rejectIfConnectionChanged, rejectIfRoomChanged } = require('./joinRecheck')
const { commitJoinedPlayer } = require('./joinCommit')

// 코드로 방 입장: 검사 → 잠금 → 방 찾기 → 프로필 → 채널 → 명단 추가 확정 → 알림
// expectedRoom 있으면 그 방 id·종류만 받음 (목록에서 고른 방·방 id 같이 보낸 요청)
// await는 전부 여기만: 도우미가 기다리면 거절 알림과 토큰 풀기 사이가 벌어짐
async function handleJoinRoomByCode(io, socket, uuid, roomCode, expectedRoom = null) {
    // Node 여러 개: 시도 횟수를 Node끼리 합쳐 셈 (Redis 기다림이 있어 다른 검사보다 먼저, MN-019)
    if (isJoinLimitShared() && !(await takeSharedJoinAttempt(uuid))) {
        emitRoomJoinFailed(socket, TOO_MANY_JOIN_ATTEMPTS, TOO_MANY_JOIN_ATTEMPTS_MESSAGE)
        return
    }
    const ctx = reserveJoin(io, socket, uuid, roomCode, { expectedRoom, autoJoin: false })
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
        // 판 끝 뒤 다시 연 방이 빈 채 방장 칸도 비었으면 이 사람이 방장 (확정과 사이에 await 없음)
        claimHostIfVacant(room, uuid)
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

module.exports = {
    handleJoinRoomByCode,
}
