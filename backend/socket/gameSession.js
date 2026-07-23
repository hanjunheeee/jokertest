const gameSessionCore = require('../game-core/gameSession')

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

module.exports = { onDisconnect }
