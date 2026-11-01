// 재판 입구, 상수·투표함·투표 받기·판정·방송 내용 묶어서 내보냄
// gameSession.js·나가기·스냅샷이 이 입구로 가져다 씀
const { TRIBUNAL_CANCELLED_OUTCOME, TRIBUNAL_CANCEL_REASONS } = require('./constants')
const {
    TRIBUNAL_PENDING, getEligibleTribunalVoterUuids, buildTribunalBallotSnapshot,
    tallyTribunalBallots, isSameBallots,
} = require('./ballots')
const { submitTribunalVote, readTribunalVoteSubmitSfxEvent } = require('./vote')
const {
    prepareTribunalVoteResolution, commitTribunalVoteResolution, buildTribunalVoteResolvedPayload,
} = require('./resolve')

module.exports = {
    TRIBUNAL_CANCELLED_OUTCOME, TRIBUNAL_CANCEL_REASONS,
    TRIBUNAL_PENDING, getEligibleTribunalVoterUuids, buildTribunalBallotSnapshot,
    tallyTribunalBallots, isSameBallots,
    submitTribunalVote, readTribunalVoteSubmitSfxEvent,
    prepareTribunalVoteResolution, commitTribunalVoteResolution,
    buildTribunalVoteResolvedPayload,
}