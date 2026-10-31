export function computeNightActionSubmitPatch(response) {
  if (response?.ok) return { status: "idle", error: null }
  return { status: "idle", error: response?.message ?? "제출하지 못했습니다." }
}
