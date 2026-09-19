/**
 * F-23(AC-06): 지금 이 화면에 "관전 계속하기 / 게임 나가기" 선택을 띄워야 하는가.
 *
 * 순수 함수로 떼어 둔 이유는 InGamePage가 .jsx라 node:test로 직접 값을 넣어 볼 수 없기
 * 때문이다(selectInGameSessionGuard와 같은 관례).
 *
 * ── 무엇을 근거로 삼는가 ──────────────────────────────────────────────────────
 *
 * 다음 **네 가지가 모두** 성립할 때만 true다:
 *
 *   1. 진행 중인 판이다. ENDED는 결과 화면으로 넘어가는 자리라 선택을 띄우지 않는다
 *      (띄우면 결과 이동을 가로막는다).
 *   2. 인증 계정과 이 세션이 말하는 **본인**이 같다. 두 값이 어긋나면 남의 상태를 보고
 *      내 선택을 만드는 것이다.
 *   3. canonical roster의 **내 항목**이 alive=false다. 잠정 피격 표식
 *      (pendingEliminationTargetId)이나 아직 갱신되지 않은 다른 필드는 쓰지 않는다 —
 *      의사 치료로 최종 생존하는 경우까지 선택이 열린다.
 *   4. 그 항목이 여전히 **참여 중**이다(isParticipating !== false). 이미 이탈을 커밋한
 *      계정에게 다시 "계속 볼까요"를 묻지 않는다.
 *
 * 이 판정은 화면 표시만 정한다 — 서버의 역할·소속·가입은 무엇도 바꾸지 않는다(A-04).
 *
 * @param {object|null} gameState - ingameStore의 state
 * @param {string|null} authUuid - 지금 인증된 계정 uuid
 */
export function selectInGameDeadParticipantChoice(gameState, authUuid) {
  if (gameState === null || typeof gameState !== "object") return false
  if (gameState.phase === "ENDED") return false
  if (typeof authUuid !== "string" || authUuid.length === 0) return false

  const selfUuid = gameState.self?.uuid ?? null
  if (selfUuid !== authUuid) return false

  const seated = (gameState.players ?? []).find((player) => player?.uuid === authUuid)
  if (!seated) return false
  if (seated.alive !== false) return false
  // 구버전 상태에는 이 키가 없다 — 그때는 roster에 있다는 사실이 곧 참여다.
  if (seated.isParticipating === false) return false
  return true
}
