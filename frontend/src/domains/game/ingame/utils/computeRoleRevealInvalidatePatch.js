/**
 * invalidate()가 React state에 적용해야 할 값을 계산한다. mounted라면 이전 상태가
 * acked/error 무엇이었든 상관없이 항상 idle/에러없음으로 되돌린다(새 gameId·새 Socket으로
 * 이전 게임의 완료·에러 상태가 새어나가지 않게 하기 위함) — unmounted라면 React state를
 * 전혀 건드리지 않아야 하므로 null을 돌려준다.
 */
export function computeRoleRevealInvalidatePatch(mounted) {
  if (!mounted) return null
  return { status: "idle", error: null }
}
