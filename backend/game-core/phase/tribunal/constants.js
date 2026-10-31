// 재판 상수 파일
// 재판 취소 결과·취소 이유 이름, 재판 판정이랑 게임 중 나가기가 사용

// 재판 취소됐을 때 결과 값
const TRIBUNAL_CANCELLED_OUTCOME = 'CANCELLED'

// 재판 취소 이유
const TRIBUNAL_CANCEL_REASONS = Object.freeze({
    DEFENDANT_LEFT: 'DEFENDANT_LEFT',
})

module.exports = { TRIBUNAL_CANCELLED_OUTCOME, TRIBUNAL_CANCEL_REASONS }