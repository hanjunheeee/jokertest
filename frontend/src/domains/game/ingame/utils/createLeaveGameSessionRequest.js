/**
 * leave_game_session 요청을 보내는 함수를 만든다. 나가기 버튼과 뒤로가기(POP) 가로채기가
 * 이 함수 하나를 공유해, 두 진입점에서 항상 같은 요청·ack 처리 규칙을 따르게 한다.
 *
 * gameId는 emit하는 그 시점에 getCurrentGameId()로 캡처해 payload에 담는다(서버가
 * canonical gameId를 ack에 담아 돌려주지 않으므로, ack 판별 기준을 직접 들고 있어야 한다).
 * ack가 도착했을 때 getCurrentGameId()를 다시 조회해 캡처해둔 gameId와 비교한다 — 그 사이
 * game_ended나 다른 경로로 이미 세션이 바뀌었다면(늦게 도착한 이전 요청의 ack) store를
 * 건드리지 않는다. 서버 ack가 { ok:false }여도, 그리고 그 사이 이미 세션이 바뀌어 있어도
 * finalize는 호출하지 않는다 — 오직 "지금 이 gameId에 대한" 성공 ack만 finalize를 트리거한다.
 */
export function createLeaveGameSessionRequest({ getSocket, getCurrentGameId, finalize, onFailure }) {
  return () => {
    const socket = getSocket()
    if (!socket) return

    const requestedGameId = getCurrentGameId()
    if (!requestedGameId) return

    socket.emit("leave_game_session", { gameId: requestedGameId }, (response) => {
      if (getCurrentGameId() !== requestedGameId) return
      if (response?.ok) {
        finalize()
        return
      }
      onFailure?.(response)
    })
  }
}
