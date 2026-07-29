/**
 * GameSession 종료를 반영하는 단일 finalizer를 만든다. 명시적 이탈 ack 성공, game_ended
 * 수신, 자신의 disconnect 정리가 모두 이 함수 하나만 거치게 해, 세 경로 중 어느 것이 먼저
 * 도착해도 인게임 store와 matching store가 정확히 한 번 초기화되고 로비로 이동하는 결과가
 * 동일하게 보장된다.
 *
 * clearGame/clearRoom을 각각 다시 호출해도(예: game_ended 뒤에 뒤늦은 이탈 ack가 와도) 이미
 * null/초기값인 상태를 다시 쓰는 것뿐이라 안전하다 — 별도의 "이미 실행됨" 플래그를 두지 않는다.
 */
export function createSessionEndFinalizer({ clearGame, clearRoom, navigate }) {
  return () => {
    clearGame()
    clearRoom()
    navigate("/multiplay", { replace: true })
  }
}
