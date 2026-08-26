/**
 * 결과 화면에서 로비로 돌아가는 요청을 만든다 — leave_game_session ack의 성패와 무관하게
 * 항상 finalize(세션 정리 + 로비 이동)로 끝난다.
 *
 * 인게임의 createLeaveGameSessionRequest를 재사용하지 않는 이유는 두 가지다.
 * (1) 그 함수는 성공 ack에서만 finalize를 호출하는 것을 명시적 계약으로 삼는다 — 실패에도
 *     이동하도록 바꾸면 인게임 나가기·뒤로가기 계약이 함께 깨진다.
 * (2) 콜백형 emit이라 timeout 개념이 없다 — ack가 유실되면 유저가 결과 페이지에 갇힌다.
 * 결과 화면은 게임이 이미 끝난 뒤이므로 "이탈 실패 시 화면에 남는다"가 오히려 잘못된 결과다.
 */

/** leave_game_session ack 대기 상한 — 저장소 전역 ack timeout 관례와 같은 5초. */
export const LEAVE_GAME_SESSION_ACK_TIMEOUT_MS = 5000

/**
 * 로비 복귀 요청 함수를 만든다.
 *
 * @param {() => object|null} getSocket 현재 socket 인스턴스를 돌려주는 접근자
 * @param {() => string|null} getCurrentGameId store의 현재 gameId를 돌려주는 접근자
 * @param {() => void} finalize 세션 정리 + 로비 이동을 수행하는 단일 finalizer
 * @param {number} [timeoutMs] ack 대기 상한(기본 LEAVE_GAME_SESSION_ACK_TIMEOUT_MS)
 * @flow gameId가 없으면(preview 진입) getSocket조차 부르지 않고 곧장 finalize한다. gameId가
 *   있으면 leave_game_session ack를 기다리되, ok:false·timeout·네트워크 오류를 모두 삼킨다 —
 *   backend handleLeaveGameSession이 멱등이라 클라이언트가 재시도할 이유가 없고, 어떤 경로든
 *   finalize는 정확히 한 번 호출된다. 연타로 leave가 두 번 나가지 않도록 pending을 두지만,
 *   늦게 도착한 ack가 바뀐 세션을 건드리는 것을 막는 gameId 재조회 가드는 두지 않는다 —
 *   결과 화면은 게임이 끝난 뒤라 그 사이 새 세션이 들어올 경로가 없다.
 */
export function createGameResultExitRequest({
  getSocket,
  getCurrentGameId,
  finalize,
  timeoutMs = LEAVE_GAME_SESSION_ACK_TIMEOUT_MS,
}) {
  let pending = false

  return async () => {
    if (pending) return
    pending = true
    try {
      const gameId = getCurrentGameId()
      const socket = gameId ? getSocket() : null

      if (socket && gameId) {
        try {
          await socket.timeout(timeoutMs).emitWithAck("leave_game_session", { gameId })
        } catch {
          // ack 실패·유실·timeout을 여기서 삼킨다 — 유저를 결과 페이지에 가두지 않는다.
        }
      }

      finalize()
    } finally {
      pending = false
    }
  }
}
