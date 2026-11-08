// 추방 결과 조회 핸들러 파일
// 대기방 추방 영수증 다시 읽기(응답 잃은 화면이 결과 확인), register가 등록·시험은 gameSession.js로 부름
// 게임 중 추방은 없앰 (2026-11-09, 대기방 추방만 남김)
const kickReceiptStore = require('../../kickReceiptStore')
const { staleSocketReply, respond } = require('../../common/replies')
const { isCurrentSocketForUuid } = require('../connection/ownership')

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
    handleGetKickResult,
}
