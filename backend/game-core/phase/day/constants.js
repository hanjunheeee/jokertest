// 낮 상수 파일
// 낮 단계 이름·기본 시간, 낮·나가기·진행 표시·socket 쪽이 사용

// 낮 안의 작은 단계: 토론 → 투표
const DAY_PHASES = Object.freeze({ DISCUSSION: 'DAY_DISCUSSION', VOTE: 'DAY_VOTE' })

// 낮 토론 기본 1분 (방 설정에 없을 때)
const DAY_DISCUSSION_DURATION_MS = 60_000

// 낮 투표 기본 1분 (방 설정에 없을 때)
const DAY_VOTE_DURATION_MS = 60_000

// 낮 판정 결과 이름: 피고로 뽑힌 사람이 그 순간 끊겨 있어 재판을 안 열고 밤으로 감 (사용자 결정 2026-11-16)
const DAY_VOTE_DEFENDANT_DISCONNECTED = 'DEFENDANT_DISCONNECTED'

module.exports = {
    DAY_PHASES,
    DAY_VOTE_DEFENDANT_DISCONNECTED,
    DAY_DISCUSSION_DURATION_MS,
    DAY_VOTE_DURATION_MS,
}