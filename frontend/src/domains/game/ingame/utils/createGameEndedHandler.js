/**
 * game_ended 이벤트 핸들러를 만든다. getCurrentGameId/finalize를 주입받아 React 훅 밖에서
 * 테스트 가능하게 한다. finalize는 명시적 이탈 ack 성공·자신의 disconnect 정리와 공유하는
 * 종료 finalizer다(createSessionEndFinalizer 참고) — 세 경로가 각자 clearGame/navigate를
 * 따로 호출하지 않고 하나로 모아, 초기화·이동 결과가 항상 동일하게 보장된다.
 *
 * payload.gameId가 getCurrentGameId()의 현재 값과 다르면(늦게 도착한 이전 GameSession의
 * 이벤트, 또는 그 사이 새 GameSession을 시작한 경우) 조용히 무시한다 — 무관한 stale
 * 이벤트가 진행 중인 새 게임을 강제로 끝내는 것을 막는다(백엔드 expectedGameId ABA
 * 가드와 동일한 원칙).
 */
export function createGameEndedHandler({ getCurrentGameId, finalize }) {
  return (payload) => {
    if (!payload || payload.gameId !== getCurrentGameId()) return
    finalize()
  }
}
