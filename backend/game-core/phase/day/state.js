// 낮 상태 파일
// 낮·투표 단계 들어가기 + 낮 값 안전하게 읽기
const { DAY_PHASES } = require('./constants')

// 낮 시작: 날짜 +1, 토론부터, 낮 기록 전부 새로
function enterDayPhase(session) {
    session.phase = 'DAY'
    session.dayIndex += 1
    session.dayPhase = DAY_PHASES.DISCUSSION
    session.dayVoteReadyUuids = new Set()
    session.dayVotes = new Map()
    session.dayVoteRound = 1
    session.dayVoteExcludedUuids = new Set()
    session.dayVoteSfx = new Map()
}

// 지금 낮 단계 (이상한 값이면 토론으로 봄)
function getDayPhase(session) {
    return session.dayPhase === DAY_PHASES.VOTE || session.dayPhase === DAY_PHASES.DISCUSSION
        ? session.dayPhase
        : DAY_PHASES.DISCUSSION
}

// 토론 → 투표로 넘김, 준비 기록 비움
function enterDayVotePhase(session) {
    session.dayPhase = DAY_PHASES.VOTE
    session.dayVoteReadyUuids = new Set()
}

// 몇 번째 투표인지 (재투표면 2, 이상한 값이면 1)
function getDayVoteRound(session) {
    return Number.isInteger(session.dayVoteRound) && session.dayVoteRound >= 1 ? session.dayVoteRound : 1
}

// 이번 투표에서 뽑을 수 없는 사람 (재투표 때)
function getDayVoteExcludedUuids(session) {
    return session.dayVoteExcludedUuids instanceof Set ? session.dayVoteExcludedUuids : new Set()
}

// 판정 결과가 몇 번째 투표 것인지
function getResolutionRound(resolution) {
    return Number.isInteger(resolution?.round) && resolution.round >= 1 ? resolution.round : 1
}

module.exports = {
    enterDayPhase,
    getDayPhase,
    enterDayVotePhase,
    getDayVoteRound,
    getDayVoteExcludedUuids,
    getResolutionRound,
}