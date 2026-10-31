// 낮 상수 파일
// 낮 단계 이름 · 토론·투표 시간, phase/day 안 파일들이랑 socket 타이머가 사용

// 낮 안의 작은 단계: 토론 → 투표
const DAY_PHASES = Object.freeze({ DISCUSSION: 'DAY_DISCUSSION', VOTE: 'DAY_VOTE' })

// 낮 토론 1분
const DAY_DISCUSSION_DURATION_MS = 60_000

// 낮 투표 1분
const DAY_VOTE_DURATION_MS = 60_000

module.exports = {
    DAY_PHASES,
    DAY_DISCUSSION_DURATION_MS,
    DAY_VOTE_DURATION_MS,
}