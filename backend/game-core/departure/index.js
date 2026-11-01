// 나가기 입구, 끊김 탈락·게임 중 나가기·방송 내용 묶어서 내보냄
// gameSession.js가 이 입구로 가져다 씀
const {
    commitDisconnectElimination, recordForfeit, buildDisconnectPayload,
} = require('./eliminate')
const { commitParticipantDeparture, advanceStalledPhase } = require('./leave')

module.exports = {
    commitDisconnectElimination, recordForfeit,
    commitParticipantDeparture, advanceStalledPhase,
    buildDisconnectPayload,
}
