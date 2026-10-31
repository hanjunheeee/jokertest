export function computeResolveNightInvalidatePatch(mounted) {
  if (!mounted) return null
  return { status: "idle", error: null, nightActionResult: null }
}
