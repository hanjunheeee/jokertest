// 재판 상수 파일
// 재판 취소·피고 사망 결과·취소 이유 이름·마감 기권 표 값, 재판 판정·게임 중 나가기·재판 마감이 사용

// 재판 취소됐을 때 결과 값 (지금은 안 만듦: 피고가 빠지면 전부 피고 사망, 옛 값을 읽는 쪽만 남음)
const TRIBUNAL_CANCELLED = 'CANCELLED'

// 재판 취소 이유
const TRIBUNAL_CANCEL_REASONS = Object.freeze({
    DEFENDANT_LEFT: 'DEFENDANT_LEFT',
})

// 재판 도중 피고가 빠졌을 때 결과 값: 스스로 나감·끊겨 60초 못 돌아옴 둘 다 (재판 취소가 아니라 피고 사망으로 닫음, 사용자 결정 2026-11-16)
const TRIBUNAL_DEFENDANT_DIED = 'DEFENDANT_DIED'

// 재판 마감까지 안 낸 사람 표 (유죄·무죄 어느 쪽에도 안 셈)
const TRIBUNAL_ABSTAIN = 'ABSTAIN'

module.exports = { TRIBUNAL_CANCELLED, TRIBUNAL_CANCEL_REASONS, TRIBUNAL_DEFENDANT_DIED, TRIBUNAL_ABSTAIN }