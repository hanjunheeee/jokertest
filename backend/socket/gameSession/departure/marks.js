// 이탈 뒤 판정 표식 파일
// 이탈 커밋 때 지금 판정 자리 좌표 남기기·지우기·그대로인지 보기, 이탈 반영·바로 판정·판 끝 정리가 씀
const gameSessionCore = require('../../../game-core/gameSession')
const { departureResolveMarks } = require('../core/state')

// 지금 판정 자리 좌표: 낮 투표면 날짜·라운드, 안 끝난 재판이면 날짜·후보 (그 밖엔 null)
function currentCoordinate(session) {
    if (!session) return null
    if (session.phase === 'DAY' && gameSessionCore.getDayPhase(session) === gameSessionCore.DAY_PHASES.VOTE) {
        return `DAY_VOTE:${session.dayIndex}:${gameSessionCore.getSessionDayVoteRound(session.id)}`
    }
    if (session.phase === 'TRIBUNAL' && session.tribunal && session.tribunal.resolved !== true) {
        return `TRIBUNAL:${session.dayIndex}:${session.tribunal.candidateId}`
    }
    return null
}

// 이탈 커밋 뒤 표식 남김: 남은 사람이 다 내면 그 자리에서 바로 판정
function markDeparturePending(session) {
    const coordinate = currentCoordinate(session)
    if (coordinate === null) return
    departureResolveMarks.set(session.id, coordinate)
}

// 판정했거나 판 끝나면 표식 지움
function clearDepartureMark(gameId) {
    departureResolveMarks.delete(gameId)
}

// 표식이 지금 판정 자리 그대로인지 (라운드·후보 바뀌었으면 옛 표식)
function hasDepartureResolveMark(session) {
    const coordinate = currentCoordinate(session)
    return coordinate !== null && departureResolveMarks.get(session.id) === coordinate
}

module.exports = {
    markDeparturePending,
    clearDepartureMark,
    hasDepartureResolveMark,
}
