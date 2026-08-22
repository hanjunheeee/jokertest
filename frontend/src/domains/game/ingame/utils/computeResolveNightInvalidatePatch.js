/**
 * invalidate()가 React state에 적용해야 할 값을 계산한다. computeRoleRevealInvalidatePatch와
 * 동일한 이유(mounted가 아니면 state를 건드리지 않는다)로 null을 돌려줄 수 있다.
 *
 * 개인 조사 결과(night_action_result)는 이 패치에 포함되지 않는다 — 그 값은 store의
 * nightPrivateResult가 소유하며, disconnect·재연결·unmount로 사라지면 안 된다(이전 게임으로의
 * 이월은 store가 gameId 검사와 setGamePayload 초기화로 직접 막는다).
 *
 * @param {boolean} mounted 훅이 아직 마운트돼 있는가
 */
export function computeResolveNightInvalidatePatch(mounted) {
  if (!mounted) return null
  return { status: "idle", error: null }
}
