// 게임 추방 핸들러 파일
// 게임 중 추방 판단·실행(같은 요청 같은 답) + 결과 조회, register가 등록·시험은 gameSession.js로 부름
const gameSessionCore = require('../../../game-core/gameSession')
const kickReceiptStore = require('../../kickReceiptStore')
const { isolate } = require('../../common/isolate')
const { REPLY_MESSAGES, staleSocketReply, respond } = require('../../common/replies')
const { isCurrentSocketForUuid, getSocketForUuid } = require('../connection/ownership')
const { detachFromGameChannel } = require('../delivery/broadcast')
const { cleanupMatchmakingRooms } = require('../departure/end')
const { applyParticipantDeparture } = require('../departure/apply')

// 게임 추방 판단 검사: 처음 걸린 거절 이유 { rejection: [코드, 문구] } 또는 통과면 { session, target }
// 자기 추방·끝난 판·다른 방 인스턴스·옛 자리·방장 아님·이미 나감을 막음 (지도 11-②⑦ · 12-⑥)
function checkGameKick(uuid, input, CODES) {
    // 자기 추방은 판 찾기 전에 바로 거절
    if (input.targetUuid === uuid) return { rejection: [CODES.SELF_KICK, '자신을 추방할 수 없습니다.'] }

    // 요청이 가리킨 판·방이 지금 내 판 그대로인지
    const session = gameSessionCore.getActiveSessionForDeparture(uuid, input.gameId)
    if (!session) return { rejection: [CODES.SESSION_NOT_FOUND, '참여 중인 게임을 찾을 수 없습니다.'] }
    if (session.phase === 'ENDED') return { rejection: [CODES.GAME_ALREADY_ENDED, '이미 종료된 게임입니다.'] }
    if ((session.roomInstanceId ?? session.roomId) !== input.roomInstanceId || session.roomId !== input.roomId) {
        return { rejection: [CODES.SESSION_NOT_FOUND, '참여 중인 게임을 찾을 수 없습니다.'] }
    }

    // 요청자가 그 자리 그대로인 방장인지
    const requester = session.players.get(uuid)
    if (!requester) return { rejection: [CODES.NOT_A_PARTICIPANT, '참여 중인 게임을 찾을 수 없습니다.'] }
    if ((requester.membershipId ?? null) !== input.requesterMembershipId) {
        return { rejection: [CODES.STALE_MEMBERSHIP, '게임 정보가 변경되었습니다. 다시 불러와주세요.'] }
    }
    if (session.hostUuid !== uuid) return { rejection: [CODES.NOT_HOST, '방장만 추방할 수 있습니다.'] }

    // 대상이 아직 판에 있고 확인한 그 자리인지 (나갔다 다시 온 새 자리는 못 쫓음)
    const target = session.players.get(input.targetUuid)
    if (!target) return { rejection: [CODES.NOT_A_PARTICIPANT, '이 게임의 참가자가 아닙니다.'] }
    if (!gameSessionCore.isParticipatingInSession(session, input.targetUuid)) {
        return { rejection: [CODES.ALREADY_LEFT, '이미 게임에서 나간 참가자입니다.'] }
    }
    if ((target.membershipId ?? null) !== input.targetMembershipId) {
        return { rejection: [CODES.STALE_MEMBERSHIP, '대상이 변경되었습니다. 다시 확인해주세요.'] }
    }
    return { session, target }
}

// 게임 중 추방: 영수증으로 같은 요청은 같은 답, 판단 거절도 기록해 둠 (지도 11-③④)
function handleKickGamePlayer(io, socket, uuid, payload, callback) {
    // callback 없으면 처리 안 함 (답할 곳 없음)
    if (typeof callback !== 'function') return

    const CODES = kickReceiptStore.KICK_ERROR_CODES
    // 영수증 없이 바로 거절 답
    const reject = (code, message) => respond(callback, { ok: false, code, message })

    // 모양 먼저 (지문 만들려면 필요), 그다음 지금 소켓
    const validated = kickReceiptStore.validateKickPayload(payload, kickReceiptStore.KICK_COMMANDS.GAME)
    if (!validated.ok) {
        reject(validated.code, validated.message)
        return
    }
    const input = validated.value
    const fingerprint = kickReceiptStore.fingerprintKickRequest(kickReceiptStore.KICK_COMMANDS.GAME, input)

    if (!isCurrentSocketForUuid(uuid, socket)) {
        reject(CODES.STALE_SOCKET, REPLY_MESSAGES.REJECTED)
        return
    }

    // 같은 요청 id 다시 오면 저장된 답 그대로 (내용 다르면 재사용 거절)
    const receiptKey = kickReceiptStore.kickReceiptKey(input.bootEpoch, uuid, input.requestId)
    const recorded = kickReceiptStore.lookupKickReceipt(receiptKey)
    if (recorded) {
        if (recorded.fingerprint !== fingerprint) {
            reject(CODES.REQUEST_ID_REUSED, '이미 사용한 요청 식별자입니다.')
            return
        }
        respond(callback, { ...recorded.result, replayed: true })
        return
    }

    // 서버 재시작 전 화면에서 온 요청이면 거절 (판·자리 정보가 옛것)
    if (input.bootEpoch !== kickReceiptStore.BOOT_EPOCH) {
        reject(CODES.STALE_BOOT, '서버가 재시작되었습니다. 게임 정보를 다시 불러와주세요.')
        return
    }
    // 판단 거절은 영수증에 남겨 재시도에도 같은 답 (자리 없으면 기록 없이 잠시 후 다시)
    const decideReject = (code, message) => {
        if (!kickReceiptStore.hasKickRejectionCapacity()) {
            reject(CODES.RECEIPT_CAPACITY, '잠시 후 다시 시도해주세요.')
            return
        }
        kickReceiptStore.recordKickReceipt(receiptKey, {
            command: kickReceiptStore.KICK_COMMANDS.GAME,
            fingerprint,
            result: { ok: false, code, message },
        })
        reject(code, message)
    }

    // 판단 검사, 걸리면 영수증 남기고 거절
    const checked = checkGameKick(uuid, input, CODES)
    if (checked.rejection) {
        decideReject(...checked.rejection)
        return
    }
    const { session, target } = checked

    // 성공 영수증 자리 없으면 실행 전에 거절 (실행 뒤 기록 못 하면 재시도 답이 달라짐)
    if (!kickReceiptStore.hasKickReceiptCapacity()) {
        reject(CODES.RECEIPT_CAPACITY, '잠시 후 다시 시도해주세요.')
        return
    }

    // 쫓긴 사람에게 보낼 개인 알림 내용
    const kickedEvent = {
        gameId: session.id,
        roomId: session.roomId,
        roomInstanceId: session.roomInstanceId ?? session.roomId,
        bootEpoch: kickReceiptStore.BOOT_EPOCH,
        targetUuid: input.targetUuid,
        targetMembershipId: target.membershipId ?? null,
        hostUuid: uuid,
        requestId: input.requestId,
    }
    // 대상 소켓 (커밋 직후 채널 떼기·개인 알림에 씀)
    const targetSocket = getSocketForUuid(io, input.targetUuid)

    // 성공 답, 영수증에도 이대로 남겨 재시도에 같은 답
    const result = {
        ok: true,
        status: 'KICKED',
        gameId: session.id,
        requestId: input.requestId,
        targetUuid: input.targetUuid,
        targetMembershipId: input.targetMembershipId,
    }

    // 이탈 커밋 바로 뒤에 영수증 남기고 채널에서 뗌 (커밋 실패면 아무것도 안 남김)
    const departed = applyParticipantDeparture(io, session, input.targetUuid, {
        reason: 'KICKED_BY_HOST',
        onCommitted: () => {
            kickReceiptStore.recordKickReceipt(receiptKey, {
                command: kickReceiptStore.KICK_COMMANDS.GAME,
                fingerprint,
                result,
            })
            detachFromGameChannel(
                targetSocket, input.targetUuid, session.channelId, '[추방 채널 이탈 실패]', { gameId: session.id },
            )
        },
    })
    // 커밋이 이미 나간 사람이라 하면 판단 거절로 기록, 나머지 실패는 기록 없이 내부 오류
    if (!departed.ok) {
        if (departed.code === 'ALREADY_LEFT') {
            decideReject(CODES.ALREADY_LEFT, '이미 게임에서 나간 참가자입니다.')
        } else {
            reject(CODES.INTERNAL_ERROR, REPLY_MESSAGES.FAILED)
        }
        return
    }

    // 답 먼저, 그다음 대상 개인 알림·대기방 정리 (실패는 로그만)
    respond(callback, result)
    if (targetSocket) {
        isolate('[추방 개인 통지 실패]', { code: 'KICK_NOTIFY_ERROR', gameId: session.id },
            () => targetSocket.emit(kickReceiptStore.KICK_EVENTS.GAME_KICKED, kickedEvent))
    }
    cleanupMatchmakingRooms(io, [input.targetUuid], '[추방 시 matchmaking 정리 실패]')
}

// 추방 결과 조회: 내 영수증 있으면 그 답 다시, 없으면 UNKNOWN (지도 11-④)
function handleGetKickResult(io, socket, uuid, payload, callback) {
    // callback 없으면 처리 안 함 (답할 곳 없음)
    if (typeof callback !== 'function') return

    // 지금 소켓 먼저, 그다음 조회 모양 (지도 11-④)
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respond(callback, staleSocketReply())
        return
    }

    const validated = kickReceiptStore.validateKickResultQuery(payload)
    if (!validated.ok) {
        respond(callback, { ok: false, code: validated.code, message: validated.message })
        return
    }
    const { bootEpoch, requestId } = validated.value

    // 내 영수증 없으면 결정 전·만료·다른 부팅 요청이라 UNKNOWN
    const recorded = kickReceiptStore.lookupKickReceipt(
        kickReceiptStore.kickReceiptKey(bootEpoch, uuid, requestId),
    )
    if (!recorded) {
        respond(callback, { ok: true, status: 'UNKNOWN', bootEpoch, requestId })
        return
    }
    respond(callback, { ...recorded.result, replayed: true, bootEpoch, requestId })
}

module.exports = {
    handleKickGamePlayer,
    handleGetKickResult,
}
