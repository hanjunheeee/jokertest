// 낮 상태 파일
// 낮·투표 단계 들어가기 + 낮 값 안전하게 읽기
// 낮 파일들이랑 역할 확인·밤 판정·나가기·스냅샷이 사용
const { DAY_PHASES } = require('./constants')

// 낮 시작: 날짜 +1, 토론부터, 낮 기록 전부 새로
function enterDayPhase(session) {
    session.phase = 'DAY'
    session.dayIndex += 1
    session.dayPhase = DAY_PHASES.DISCUSSION
    // 준비·표·재투표 제외·효과음 기록 새 그릇으로 (지난 날 것 안 섞이게)
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

// 투표 준비 누른 사람 명단 (없거나 이상한 값이면 빈 명단)
// 낮 준비·진행 표시·나가기가 같은 규칙으로 읽기
function getDayVoteReadyUuids(session) {
    return session.dayVoteReadyUuids instanceof Set ? session.dayVoteReadyUuids : new Set()
}

// 이번 투표(오늘·지금 투표 번호)가 이미 판정 끝났는지
// 낮 표 받기·낮 판정 준비가 같이 씀
function isDayVoteRoundResolved(session) {
    return (
        session.dayVoteResolution !== null &&
        session.dayVoteResolution.dayIndex === session.dayIndex &&
        getResolutionRound(session.dayVoteResolution) === getDayVoteRound(session)
    )
}

module.exports = {
    enterDayPhase,
    getDayPhase,
    enterDayVotePhase,
    getDayVoteRound,
    getDayVoteExcludedUuids,
    getResolutionRound,
    getDayVoteReadyUuids,
    isDayVoteRoundResolved,
}