// 낮 상수 파일
// 낮 단계 이름·기본 시간, 낮·나가기·진행 표시·socket 쪽이 사용

// 낮 안의 작은 단계: 토론 → 투표
const DAY_PHASES = Object.freeze({ DISCUSSION: 'DAY_DISCUSSION', VOTE: 'DAY_VOTE' })

// 낮 토론 기본 1분 (방 설정에 없을 때)
const DAY_DISCUSSION_DURATION_MS = 60_000

// 낮 투표 기본 1분 (방 설정에 없을 때)
const DAY_VOTE_DURATION_MS = 60_000

module.exports = {
    DAY_PHASES,
    DAY_DISCUSSION_DURATION_MS,
    DAY_VOTE_DURATION_MS,
}