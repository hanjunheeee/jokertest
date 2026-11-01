// 판 끝내기·밤으로 넘기기 파일
// 끝난 판 막기·승패 판정·판 닫기 + 밤 시작, 요청 확인·채팅·밤·낮·재판·나가기가 사용
const { observeNightCommit } = require('../tools/observer')

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
    // 여기부터 진짜 바뀜: 판 상태를 끝으로
    session.phase = 'ENDED'
    session.winResult = winResult
    session.endedAt = Date.now()
    // 시험 관찰자한테 판 끝났다고 알림 (운영은 그냥 지나감)
    observeNightCommit('GAME_FINALIZED', { gameId: session.id, winner: winResult?.winner ?? null })
}

// 밤 시작: 단계 NIGHT, 밤 행동·판정·진행 기록 새로 (지난 밤 것 안 섞이게)
// 낮·재판·나가기가 다 써서 phase/night 말고 core에 둠 (낮↔밤 require 막기)
function enterNightPhase(session) {
    session.phase = 'NIGHT'
    session.nightActions = new Map()
    session.nightResolution = null
    session.nightProgress = null
}

module.exports = { assertSessionNotEnded, evaluateWinCondition, finalizeGameSession, enterNightPhase }