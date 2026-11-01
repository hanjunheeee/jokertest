// ack 답 모양 파일
// 거절·실패 답 객체 만들기 + ack 보내기 감싸기
// socket gameSession 핸들러·요청 검사·밤 마무리가 같이 씀

// 답 문구 (화면에 그대로 보이는 말)
const REPLY_MESSAGES = Object.freeze({
    REJECTED: '요청을 처리할 수 없습니다.',
    INVALID: '잘못된 요청입니다.',
    FAILED: '요청을 처리하지 못했습니다.',
})

// 거절 답: 코드만 알려 주고 문구는 하나로 (부를 때마다 새 객체)
function rejectedReply(code) {
    return { ok: false, code, message: REPLY_MESSAGES.REJECTED }
}

// 지금 그 계정 소켓이 아님 (새 탭이 가져감, 지도 05-①)
function staleSocketReply() {
    return rejectedReply('STALE_SOCKET')
}

// 요청 모양이 틀림 (지도 05-②)
function invalidPayloadReply() {
    return { ok: false, code: 'INVALID_PAYLOAD', message: REPLY_MESSAGES.INVALID }
}

// 서버 안에서 실패함, 내부 사정은 숨김 (지도 06-⑨)
function internalErrorReply() {
    return { ok: false, code: 'INTERNAL_ERROR', message: REPLY_MESSAGES.FAILED }
}

// ack 보내기: callback이 던져도 밖으로 안 새게 (지도 03-⑥)
function respond(callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[ack 전달 실패]', err)
    }
}

// 로그 라벨 붙은 ack 함수 만들기: 던지면 { code, uuid, gameId }만 찍음 (원본 에러는 안 찍음)
function labeledResponder(label) {
    return (uuid, gameId, callback, payload) => {
        try {
            callback(payload)
        } catch {
            console.error(label, { code: 'CALLBACK_ERROR', uuid, gameId })
        }
    }
}

module.exports = {
    REPLY_MESSAGES,
    rejectedReply,
    staleSocketReply,
    invalidPayloadReply,
    internalErrorReply,
    respond,
    labeledResponder,
}
