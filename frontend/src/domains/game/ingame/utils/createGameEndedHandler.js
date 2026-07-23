/**
 * game_ended 이벤트 핸들러를 만든다. getCurrentGameId/clearGame/navigate를 주입받아
 * React 훅 밖에서 테스트 가능하게 한다.
 *
 * payload.gameId가 getCurrentGameId()의 현재 값과 다르면(늦게 도착한 이전 GameSession의
 * 이벤트, 또는 그 사이 새 GameSession을 시작한 경우) 조용히 무시한다 — 무관한 stale
 * 이벤트가 진행 중인 새 게임을 강제로 끝내는 것을 막는다(백엔드 expectedGameId ABA
 * 가드와 동일한 원칙).
 */
export function createGameEndedHandler({ getCurrentGameId, clearGame, navigate }) {
  return (payload) => {
    if (!payload || payload.gameId !== getCurrentGameId()) return
    clearGame()
    navigate("/multiplay")
  }
}
