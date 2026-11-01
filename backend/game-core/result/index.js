// 판 결과 입구, 상수·전적 기록·결과 공개 묶어서 내보냄
// gameSession.js·판 준비·밤·재판·끊김 탈락·스냅샷이 이 입구로 사용
// 승리 이유·죽은 이유 이름
const {
    ABORTED_WINNER, ABORTED_WIN_REASON, WIN_REASON_BY_WINNER, DEATH_REASONS,
} = require('./constants')
// 전적 기록 만들기·테스트 판 구분
const { resolveGameSource, buildGameResultRecord } = require('./record')
// 승패·전원 역할 공개
const { buildTerminalFields, buildPublicWinResult, buildRoleReveals } = require('./winReveal')

module.exports = {
    ABORTED_WINNER, ABORTED_WIN_REASON, WIN_REASON_BY_WINNER, DEATH_REASONS,
    resolveGameSource, buildGameResultRecord,
    buildTerminalFields, buildPublicWinResult, buildRoleReveals,
}