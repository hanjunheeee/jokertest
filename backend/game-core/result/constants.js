// 판 결과 상수 파일
// 승리 이유·죽은 이유 이름, result 폴더·밤·재판·끊김 탈락이 사용

// 중간에 깨진 판: 승자 없음
const ABORTED_WINNER = 'NONE'
// 중간에 깨진 판: 이유
const ABORTED_WIN_REASON = 'ABORTED'

// 승자별 승리 이유
const WIN_REASON_BY_WINNER = Object.freeze({
    CITIZEN: 'ALL_JOKERS_ELIMINATED',
    JOKER: 'JOKER_PARITY_REACHED',
})

// 죽은 이유: 밤 암살 · 재판 처형 · 끊김
const DEATH_REASONS = Object.freeze({
    ASSASSINATION: 'ASSASSINATION',
    EXECUTION: 'EXECUTION',
    DISCONNECT: 'DISCONNECT',
})

module.exports = { ABORTED_WINNER, ABORTED_WIN_REASON, WIN_REASON_BY_WINNER, DEATH_REASONS }