// 판 보여주기 입구, 진행 표시·내 진행 번호·판 스냅샷·바뀜 방송 묶어서 내보냄
// gameSession.js가 여기로 가져다 씀 (socket 쪽 새로고침·방송용)
const {
    buildPublicProgress, buildSelfFields, computeHasActed,
    bumpSelfProgressSeq,
} = require('./progress')
const {
    canIncludeVoteFields, buildSessionSnapshot, getSessionSnapshotForPlayer,
} = require('./session')
const { buildPhaseChangedPayload, buildParticipationChangedPayload } = require('./payloads')

module.exports = {
    buildPublicProgress, buildSelfFields, computeHasActed,
    bumpSelfProgressSeq,
    canIncludeVoteFields, buildSessionSnapshot, getSessionSnapshotForPlayer,
    buildPhaseChangedPayload, buildParticipationChangedPayload,
}
