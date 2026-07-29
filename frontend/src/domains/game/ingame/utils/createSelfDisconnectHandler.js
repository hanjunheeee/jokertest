/**
 * 자신의 Socket이 disconnect될 때 인게임 상태를 정리하는 핸들러를 만든다. 다른 참가자는
 * game_ended를 받아 정리하지만, disconnect 당사자 본인은 그 방송을 받을 수 없으므로
 * (Socket이 이미 끊긴 뒤라 애초에 전달될 곳이 없음) 이 별도 경로가 필요하다.
 *
 * registeredSocket/registeredGameId는 이 리스너가 등록되던 시점(effect 실행 시점)의 Socket
 * 인스턴스와 gameId를 그대로 캡처한 값이다 — 호출 시점에 다시 조회하지 않는다. disconnect
 * 발생 시 두 가지를 모두 확인한 뒤에만 finalize한다:
 *   1) getActiveSocket()이 여전히 이 registeredSocket과 같은 참조인지(Socket이 이미
 *      교체되지 않았는지)
 *   2) getCurrentGameId()가 registeredGameId와 여전히 같은지(그 사이 다른 경로로 세션이
 *      이미 종료·교체되지 않았는지)
 * 두 조건을 함께 확인하는 이유: Socket이 이미 교체된 뒤 오래된 리스너에 지연 도착한
 * disconnect는, store의 gameId만 비교하면 그 사이 바뀐 현재 값과 우연히 같아 보일 수 있다
 * — Socket 신원 확인 없이 gameId 비교만으로 판단하지 않는다.
 */
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
