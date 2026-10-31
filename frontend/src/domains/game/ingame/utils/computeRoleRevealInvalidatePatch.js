export function computeRoleRevealInvalidatePatch(mounted) {
  if (!mounted) return null
  return { status: "idle", error: null }
}
