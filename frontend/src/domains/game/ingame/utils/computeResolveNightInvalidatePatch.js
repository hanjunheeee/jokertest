/**
 * invalidate()가 React state에 적용해야 할 값을 계산한다. computeRoleRevealInvalidatePatch와
 * 동일한 이유(mounted가 아니면 state를 건드리지 않는다)로 null을 돌려줄 수 있다는 점은 같지만,
 * resolve_night는 개인 결과(nightActionResult)도 함께 들고 있으므로 그 값까지 초기화한다 —
 * 이전 gameId·Socket의 판정 결과가 새 게임으로 새어나가지 않게 하기 위함이다.
 */
export function computeResolveNightInvalidatePatch(mounted) {
  if (!mounted) return null
  return { status: "idle", error: null, nightActionResult: null }
}
