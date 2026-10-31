// 판 끝내는 파일
// 승패 판정 + 판 끝내기(끝난 판 막기·판 닫기), 밤 판정·재판·끊김 탈락 뒤에 부름
const { observeNightCommit } = require('./observer')

// 끝난 판(ENDED)이면 요청 거절, 아니면 통과
function assertSessionNotEnded(session) {
    if (session.phase === 'ENDED') return { ok: false, code: 'GAME_ALREADY_ENDED' }
    return { ok: true }
}

// 승패 판정, 아직 안 끝났으면 null
function evaluateWinCondition(session) {
    // 산 사람만 세기: 광대 / 광대 아닌 사람
    let aliveJokerCount = 0
    let aliveNonJokerCount = 0
    for (const player of session.players.values()) {
        if (!player.alive) continue
        if (player.role === 'JOKER') aliveJokerCount += 1
        else aliveNonJokerCount += 1
    }
    // 광대 다 죽으면 시민 승
    if (aliveJokerCount === 0) return { winner: 'CITIZEN' }
    // 광대가 나머지 수 이상이면 광대 승
    if (aliveJokerCount >= aliveNonJokerCount) return { winner: 'JOKER' }
    return null
}

// 판 닫기: ENDED로 바꾸고 승패·끝난 시각 기록, 관찰자한테 알림
function finalizeGameSession(session, winResult) {
    session.phase = 'ENDED'
    session.winResult = winResult
    session.endedAt = Date.now()
    observeNightCommit('GAME_FINALIZED', { gameId: session.id, winner: winResult?.winner ?? null })
}

module.exports = { assertSessionNotEnded, evaluateWinCondition, finalizeGameSession }