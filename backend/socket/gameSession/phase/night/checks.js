// 밤 run 판정 파일
// 지금 밤 run인지 + 그 역할 턴이 아직 제출 받는 중인지, 밤 턴이 씀
const { NIGHT_TURN_STAGES } = require('../../core/constants')
const { nightTurnRuns } = require('../../core/state')

// 이 run이 아직 그 판의 지금 밤 run인지 (늦게 온 옛 타이머 거르기, 지도 05-⑩)
function isCurrentNightRun(run) {
    return nightTurnRuns.get(run.session.id) === run
}

// 그 역할 턴이 아직 제출 받는 중인지 (이미 닫힌 턴을 또 닫지 않게)
function isSubmittingNightTurn(run, role) {
    if (!isCurrentNightRun(run)) return false
    if (run.session.nightTurnRole !== role) return false
    return run.stage === NIGHT_TURN_STAGES.SUBMITTING
}

module.exports = {
    isCurrentNightRun,
    isSubmittingNightTurn,
}
