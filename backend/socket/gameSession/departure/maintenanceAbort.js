// 점검 판 무효 끝 파일, 점검 시작 시각에 이 Node 진행 중 판 전부를 승패 없이 끝냄
// 점검 시계(services/ops/maintenanceClock.js)가 부름, 끝내기는 기존 나가기 길(endGameSessionForPlayer → finalizeGameSessionEnd) 그대로
const gameSessionCore = require('../../../game-core/gameSession')
const { gameSessions, playerSession } = require('../../../game-core/core/registry/state')
const { finalizeGameSessionEnd } = require('./end')

const MAINTENANCE_REASON = 'MAINTENANCE'

// 판 하나 끝내기: 무효 표시 → 아직 판에 묶인 첫 사람으로 판째 지움 → 기존 마무리(저장·타이머·대기방·game_ended·채널)
// 나간 사람 자리는 null (아무도 패 아님), 끝냈으면 true
function abortGameForMaintenance(io, session) {
    const firstUuid = [...session.players.keys()].find((uuid) => playerSession.get(uuid) === session.id)
    if (!firstUuid) return false
    // 전적 기록이 win_reason MAINTENANCE로 남고 업적 평가 건너뜀 (record.js·persist.js가 봄)
    session.abortReason = MAINTENANCE_REASON
    const result = gameSessionCore.endGameSessionForPlayer(firstUuid, MAINTENANCE_REASON, session.id)
    if (!result.ok) {
        delete session.abortReason
        return false
    }
    finalizeGameSessionEnd(io, result.session, MAINTENANCE_REASON, null, result.cleanupUuids)
    return true
}

// 이 Node 진행 중 판 전부 끝냄 → 끝낸 판 수 (결과 화면 판 ENDED는 이미 승패 나서 안 건드림)
// 판 하나가 던져도 나머지는 계속
function abortGamesForMaintenance(io) {
    let count = 0
    for (const session of [...gameSessions.values()]) {
        if (session.phase === 'ENDED') continue
        try {
            if (abortGameForMaintenance(io, session)) count += 1
        } catch (err) {
            console.error('[점검 판 끝내기 실패]', { code: 'MAINTENANCE_ABORT_ERROR', gameId: session?.id, error: err?.name })
        }
    }
    return count
}

module.exports = {
    MAINTENANCE_REASON,
    abortGamesForMaintenance,
}
