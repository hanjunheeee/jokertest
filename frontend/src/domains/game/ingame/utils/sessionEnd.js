// 판 끝·내 연결 끊김 처리기와 판 정리 후 이동 만들기
// 방 이벤트 처리·연결 감시 훅·나가기 훅이 사용

// 판 끝 알림이 지금 판 것일 때만 정리함
export function createGameEndedHandler({ getCurrentGameId, finalize }) {
  return (payload) => {
    if (!payload || payload.gameId !== getCurrentGameId()) return
    finalize()
  }
}

// 등록한 소켓·판이 그대로일 때 끊기면 정리함
export function createSelfDisconnectHandler({
  getActiveSocket,
  registeredSocket,
  registeredGameId,
  getCurrentGameId,
  finalize,
}) {
  return () => {
    if (getActiveSocket() !== registeredSocket) return
    if (getCurrentGameId() !== registeredGameId) return
    finalize()
  }
}

// 판·방 상태 지우고 멀티 화면으로 감
export function createSessionEndFinalizer({ clearGame, clearRoom, navigate }) {
  return () => {
    clearGame()
    clearRoom()
    navigate("/multiplay", { replace: true })
  }
}
