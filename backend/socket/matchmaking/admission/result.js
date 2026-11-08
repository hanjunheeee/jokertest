// 초대 수락 결과 다시 묻기 파일, ack 잃은 화면에 들어갔는지 알려 줌 (지도 23-⑩)
// matchmaking.js가 get_game_invite_result에 붙임 (수락 입장 자체는 admission/accept.js)
const { BOOT_EPOCH } = require('../core/constants')
const { playerRoom, gameRooms } = require('../core/state')
const { getAdmissionAttempt } = require('./attempts')
const { deps } = require('../core/deps')
const { buildRoomPayload } = require('../room/view')

// 수락 결과 ack 잃었을 때 결과 다시 알려 주기 (지도 23-⑩)
async function handleGetGameInviteResult(uuid, payload, callback) {
    if (typeof callback !== 'function') return
    // 요청 모양: 초대 id 필수, 시도 id는 보냈으면 그 시도 결과만 봄
    const inviteId = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload.inviteId : null
    const attemptId = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload.attemptId : undefined
    if (typeof inviteId !== 'string' || inviteId.length === 0) {
        callback({ ok: false, code: 'INVALID_REQUEST' })
        return
    }

    // 아직 입장 처리 중이면 기다리라고 답함
    if (getAdmissionAttempt(uuid)) {
        callback({ ok: true, pending: true, entered: false })
        return
    }

    // 초대 결과 읽기 (DB), 내 초대 아니면 없음, 다른 시도 결과면 옛 시도라고 답함
    const outcome = await deps.gameInviteService.getAttemptOutcome({ receiverId: uuid, inviteId, attemptId })
    if (!outcome.known) {
        callback({ ok: false, code: 'INVITE_NOT_FOUND' })
        return
    }
    if (outcome.staleAttempt) {
        callback({ ok: true, entered: false, invite: outcome.invite, staleAttempt: true })
        return
    }

    // 들어감 = PUBLISHED 기록 + 같은 서버 + 지금 그 방(같은 인스턴스) 명단에 있음
    const roomId = playerRoom.get(uuid)
    const room = roomId ? gameRooms.get(roomId) : null
    const entered = outcome.entryOutcome === 'PUBLISHED'
        && outcome.bootEpoch === BOOT_EPOCH
        && room !== null && room !== undefined
        && room.id === outcome.roomId
        && (room.instanceId ?? room.id) === outcome.roomInstanceId
        && room.players.has(uuid)

    callback({
        ok: true,
        entered,
        invite: outcome.invite,
        room: entered ? buildRoomPayload(room) : null,
    })
}

module.exports = {
    handleGetGameInviteResult,
}
