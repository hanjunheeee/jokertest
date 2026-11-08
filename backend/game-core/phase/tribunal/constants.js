// 재판 상수 파일
// 재판 취소 결과·취소 이유 이름·마감 기권 표 값, 재판 판정·게임 중 나가기·재판 마감이 사용

// 재판 취소됐을 때 결과 값
const TRIBUNAL_CANCELLED = 'CANCELLED'

// 재판 취소 이유
const TRIBUNAL_CANCEL_REASONS = Object.freeze({
    DEFENDANT_LEFT: 'DEFENDANT_LEFT',
})

// 재판 마감까지 안 낸 사람 표 (유죄·무죄 어느 쪽에도 안 셈)
const TRIBUNAL_ABSTAIN = 'ABSTAIN'

module.exports = { TRIBUNAL_CANCELLED, TRIBUNAL_CANCEL_REASONS, TRIBUNAL_ABSTAIN }