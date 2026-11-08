// 판 끝 처리기·판 없음 응답 판단과 판 정리 후 이동 만들기
// 방 이벤트 처리·스냅샷 묻기·나가기 훅이 사용

// 판 끝 알림이 지금 판 것일 때만 정리함
export function createGameEndedHandler({ getCurrentGameId, finalize }) {
  return (payload) => {
    if (!payload || payload.gameId !== getCurrentGameId()) return
    finalize()
  }
}

// 서버가 "이 판에 나는 없음"이라 답하는 코드 (판 사라짐·참가자 아님·끊김 유예 끝나 빠짐)
const SESSION_GONE_CODES = new Set(["SESSION_NOT_FOUND", "NOT_A_PARTICIPANT", "FORFEITED_FROM_SESSION"])

// 스냅샷 응답이 판 없음인지 (연결 문제·잠깐 거절과 구분하려고 코드로만 봄)
export function isSessionGoneResponse(response) {
  return response !== null && typeof response === "object"
    && response.ok !== true && SESSION_GONE_CODES.has(response.code)
}

// 판·방 상태 지우고 멀티 화면으로 감
export function createSessionEndFinalizer({ clearGame, clearRoom, navigate }) {
  return () => {
    clearGame()
    clearRoom()
    navigate("/multiplay", { replace: true })
  }
}
