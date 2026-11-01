// 재판 방송 내용 파일
// 재판 결과 방송 내용 만들기, 상태는 안 바꿈 (판정 commit은 resolve.js)
// socket 쪽 방송이랑 스냅샷이 사용
const { TRIBUNAL_CANCELLED_OUTCOME, TRIBUNAL_CANCEL_REASONS } = require('./constants')

// 재판 결과 방송 내용 (취소된 재판이면 이유도 붙임)
function buildTribunalVoteResolvedPayload(session) {
    const tribunal = session.tribunal
    const executedUuid = tribunal.executedUuid
    return {
        ...(tribunal.outcome === TRIBUNAL_CANCELLED_OUTCOME
            ? { reason: tribunal.cancelReason ?? TRIBUNAL_CANCEL_REASONS.DEFENDANT_LEFT }
            : {}),
        gameId: session.id,
        dayIndex: tribunal.dayIndex,
        phase: session.phase,
        defendantUuid: tribunal.defendantUuid,
        outcome: tribunal.outcome,
        counts: { guilty: tribunal.counts.guilty, notGuilty: tribunal.counts.notGuilty },
        executedUuid,
        // 처형된 사람 역할 공개
        executedRole: executedUuid ? session.players.get(executedUuid)?.role ?? null : null,
    }
}

module.exports = { buildTribunalVoteResolvedPayload }
