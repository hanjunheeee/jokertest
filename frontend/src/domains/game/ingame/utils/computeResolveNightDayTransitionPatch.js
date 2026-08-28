/**
 * night_result_applied(NIGHT→DAY 전이)가 React state에 적용해야 할 값을 계산한다.
 * computeResolveNightInvalidatePatch와 형태는 같지만(mounted가 아니면 null) 대상이 다르다 —
 * 판정 잠금(status)과 오류(error)만 되돌리고 개인 결과(nightActionResult)는 건드리지 않는다.
 *
 * 두 패치가 갈리는 이유: 게임/소켓 전환(gameId 변경·disconnect·unmount)은 이전 게임의 결과가
 * 새 게임으로 새어나가면 안 되므로 개인 결과까지 폐기하지만, 낮 전이는 같은 게임 안의 정상
 * 진행이고 WH·경비원의 조사 결과는 그 낮 동안 화면에서 확인할 수 있어야 한다.
 * @param {boolean} mounted - 훅이 아직 마운트돼 있는지
 */
export function computeResolveNightDayTransitionPatch(mounted) {
  if (!mounted) return null
  return { status: "idle", error: null }
}
