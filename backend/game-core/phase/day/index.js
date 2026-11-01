// 낮 입구, 상수·낮 상태·투표함·표 받기·준비·판정·방송 내용 묶어서 내보냄
// gameSession.js·나가기·밤 확정·역할 확인·스냅샷이 이 입구로 가져다 씀
const { DAY_PHASES, DAY_DISCUSSION_DURATION_MS, DAY_VOTE_DURATION_MS } = require('./constants')
const {
    enterDayPhase, getDayPhase, enterDayVotePhase, getDayVoteRound, getDayVoteExcludedUuids,
    getResolutionRound, getDayVoteReadyUuids, isVoteRoundResolved,
} = require('./state')
const {
    getEligibleDayVoterUuids, uuidListsEqual, tallyDayVoteOutcome, buildDayVoteBallotSnapshot,
    dayVoteBallotSnapshotsEqual,
} = require('./ballots')
const { submitDayVote, advanceDayVoteSfx, readDayVoteSubmitSfxEvent } = require('./vote')
const { getSessionDayIndex, getSessionDayVoteRound, acknowledgeDayVoteReady } = require('./ready')
const { prepareDayVoteResolution, commitDayVoteResolution } = require('./resolve')
const { buildDayPhaseChangedPayload, buildDayVoteResolvedPayload } = require('./payloads')

module.exports = {
    DAY_PHASES, DAY_DISCUSSION_DURATION_MS, DAY_VOTE_DURATION_MS,
    enterDayPhase, getDayPhase, enterDayVotePhase, getDayVoteRound, getDayVoteExcludedUuids,
    getResolutionRound, getDayVoteReadyUuids, isVoteRoundResolved,
    getEligibleDayVoterUuids, uuidListsEqual, tallyDayVoteOutcome, buildDayVoteBallotSnapshot,
    dayVoteBallotSnapshotsEqual,
    submitDayVote, advanceDayVoteSfx, readDayVoteSubmitSfxEvent,
    getSessionDayIndex, getSessionDayVoteRound, acknowledgeDayVoteReady,
    prepareDayVoteResolution, commitDayVoteResolution,
    buildDayPhaseChangedPayload, buildDayVoteResolvedPayload,
}