/**
 * /ingame 진입 guard의 판단을 화면(InGamePage)에서 떼어낸 순수 함수 두 개.
 *
 * InGamePage.jsx는 이 저장소의 node:test 실행에 JSX 로더가 없어 직접 렌더링해 검증할 수 없다
 * (frontend package.json의 test는 `src/**​/__tests__/*.test.js`만 실행한다). 그래서 "언제
 * /multiplay로 돌려보내는가"라는 판단만 여기로 옮겨 실제 값으로 시험할 수 있게 한다 —
 * 페이지는 이 결과를 그대로 쓰기만 하므로 화면의 동작은 그대로다.
 */

/**
 * store가 지금 이 화면을 그려도 되는 GameSession을 들고 있는지.
 * @param {string|null|undefined} gameId ingameStore.gameId
 * @param {object|null|undefined} gameState ingameStore.state (서버 세션 미러)
 * @flow gameId와 state가 모두 있고 state.id가 그 gameId와 같을 때만 유효하다 — 새로고침으로
 *   store가 비었거나 다른 게임의 잔상이 남은 경우를 모두 무효로 본다.
 */
export function isValidInGameSession(gameId, gameState) {
  if (!gameId) return false
  if (gameState === null || typeof gameState !== "object") return false
  return gameState.id === gameId
}

/**
 * 지금 /multiplay로 돌려보내야 하는지.
 * @param {object} input
 * @param {string|null|undefined} input.snapshotSyncStatus useInGameSessionSnapshotSync의 반환값
 *   ("checking" | "recovered" | "missing" | null)
 * @param {string|null|undefined} input.gameId ingameStore.gameId
 * @param {object|null|undefined} input.gameState ingameStore.state
 * @flow 재접속 스냅샷 동기화가 아직 확인 중(checking)이면 store가 비어 있어도 판단을 미룬다 —
 *   새로고침 직후에는 store가 언제나 비어 있으므로, 이 유예가 없으면 스냅샷이 도착하기 전에
 *   무조건 튕겨나간다. 확인이 끝난 뒤에만 유효하지 않은 세션을 내보낸다.
 */
export function shouldRedirectOutOfInGame({ snapshotSyncStatus, gameId, gameState }) {
  if (snapshotSyncStatus === "checking") return false
  return !isValidInGameSession(gameId, gameState)
}
