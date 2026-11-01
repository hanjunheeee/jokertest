// 판 조회 상수 파일
// 끊김 유예 걸 단계 이름, queries/live.js가 사용

// 끊김 유예 거는 진행 중 단계 (끝난 판엔 유예 걸 일 없음)
const DISCONNECT_GRACE_PHASES = Object.freeze(['ROLE_REVEAL', 'DAY', 'NIGHT', 'TRIBUNAL'])

module.exports = { DISCONNECT_GRACE_PHASES }
