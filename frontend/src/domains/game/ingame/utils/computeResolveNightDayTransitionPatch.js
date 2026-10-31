export function computeResolveNightDayTransitionPatch(mounted) {
  if (!mounted) return null
  return { status: "idle", error: null }
}
