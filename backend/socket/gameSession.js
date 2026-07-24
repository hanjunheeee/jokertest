const gameSessionCore = require('../game-core/gameSession')

// game-core가 내부 진단용으로만 반환하는 코드다(registry 불일치 등, 정상 경로에서는
// 발생하지 않아야 함). 클라이언트에는 내부 상태를 노출하지 않고 항상 INTERNAL_ERROR로
// 정규화해 응답한다.
const INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT'])

/** callback을 항상 안전하게 호출한다 — callback 자체가 던지는 예외가 이후 로직(방송 등)을 막지 않게 한다. */
function respond(callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[역할 확인 ack 전달 실패]', err)
    }
}

/**
 * ROLE_REVEAL 역할 확인 요청을 처리합니다(Socket.IO acknowledgement 방식).
 * 전원이 확인하면(game-core가 transitioned:true를 돌려주면) NIGHT 전이를 참가자 전체
 * channel에 한 번만 방송합니다. callback과 broadcast는 서로 독립적인 best-effort 통지라
 * respond()가 callback의 예외를 삼켜, 콜백이 던지더라도 아래 broadcast는 항상 실행됩니다
 * (onDisconnect의 "알림 전송과 channel 정리를 분리된 try 블록에 둔다"는 기존 관례와 동일한
 * 이유).
 */
function handleAcknowledgeRoleReveal(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId } = payload
    if (typeof gameId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let result
    try {
        result = gameSessionCore.acknowledgeRoleReveal(uuid, gameId)
    } catch (err) {
        console.error('[역할 확인 처리 에러]', err)
        respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!result.ok) {
        if (INTERNAL_ONLY_CODES.has(result.code)) {
            // registry 불일치는 클라이언트에 내부 상태를 노출하지 않고 일반 오류로만 응답한다.
            // 원본 코드와 uuid/gameId만 서버 로그에 남기고, role 등 비밀 정보는 이 함수
            // 어디에서도 로그로 남기지 않는다(result.session 자체를 로그에 넘기지 않음).
            console.error('[역할 확인 registry 불일치]', { code: result.code, uuid, gameId })
            respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respond(callback, { ok: false, code: result.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    respond(callback, { ok: true })

    if (result.transitioned) {
        try {
            io.to(result.session.channelId).emit('game_phase_changed', gameSessionCore.buildPhaseChangedPayload(result.session))
        } catch (err) {
            console.error('[phase 변경 알림 전송 실패]', err)
        }
    }
}

/** ROLE_REVEAL 확인 이벤트 배선만 담당합니다(턴/페이즈 등 이후 동기화는 다음 슬라이스의 몫). */
function registerGameHandlers(io, socket, uuid) {
    socket.on('acknowledge_role_reveal', (payload, callback) => handleAcknowledgeRoleReveal(io, socket, uuid, payload, callback))
}

/**
 * 참가자 disconnect에 따른 GameSession 정리를 처리합니다.
 * 정책(사용자 확정): 참가자 한 명의 disconnect만으로 그 GameSession 전체를 즉시
 * 종료합니다 — 부분 유지나 재접속 유예는 이번 슬라이스에 없습니다.
 *
 * game_ended payload는 { gameId, reason }만 담습니다. 수신자에 따라 달라지는 값이
 * 없으므로(참가자 uuid/nickname/role 등 어떤 식별 정보도 없음) game_started처럼
 * 참가자별로 다른 payload를 개별 전달할 필요가 없습니다 — 이미 남은 참가자들이 전부
 * 가입해 있는 기존 channel(session.channelId)에 한 번만 방송하면 충분하고, 이 편이
 * 더 단순하고 정확합니다.
 */
async function onDisconnect(io, uuid) {
    const result = gameSessionCore.endGameSessionForPlayer(uuid, 'PARTICIPANT_LEFT')
    if (!result.ok) return

    // registry 정리는 위에서 이미 끝났다 — 아래 알림/채널 정리가 실패해도 그 사실을
    // 되돌리지 않는다(정리 자체가 핵심이고 알림 전달은 best-effort다).
    const { session } = result

    // 알림 전송과 channel 정리는 서로 독립적인 best-effort 작업이라 반드시 분리된
    // try 블록에 둔다 — 같은 블록에 묶으면 emit이 던질 때 socketsLeave가 통째로
    // 건너뛰어져 channel 멤버십이 영영 정리되지 않는 문제가 생긴다. 반대 방향
    // (socketsLeave가 던질 때 알림이 막히는 것)도 마찬가지로 막는다.
    try {
        io.to(session.channelId).emit('game_ended', { gameId: session.id, reason: result.reason })
    } catch (err) {
        console.error('[GameSession 종료 알림 전송 실패]', err)
    }

    try {
        // disconnect한 소켓 자신은 Socket.IO가 이미 자동으로 모든 room에서 내보낸 뒤라 이
        // 호출과 무관하다 — 아직 channel에 남아있는 나머지 참가자들의 소켓을 명시적으로
        // 내보내 승계했던 channel 멤버십을 정리한다.
        io.in(session.channelId).socketsLeave(session.channelId)
    } catch (err) {
        console.error('[GameSession channel 정리 실패]', err)
    }
}

module.exports = {
    registerGameHandlers,
    onDisconnect,
    // 테스트에서 socket.on 배선 없이 핸들러를 직접 호출하기 위한 통로입니다(matchmaking.js의
    // __testables 관례와 동일). 런타임 코드에서는 참조하지 않습니다.
    __testables: { handleAcknowledgeRoleReveal },
}
