export function computeResolveNightAckPatch(response) {
  if (response?.ok) return { status: "resolved", error: null }
  return { status: "idle", error: response?.message ?? "판정하지 못했습니다." }
}
