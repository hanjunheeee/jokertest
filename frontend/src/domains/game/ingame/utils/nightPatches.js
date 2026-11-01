// 밤 행동 제출·밤 판정 응답을 상태 조각으로 바꾸기, 밤 방송이 지금 판 것인지 보기
// 밤 행동 제출 훅·밤 판정 훅이 사용

// 밤 행동 제출 응답 → 상태 조각 (실패면 문구)
export function computeNightActionSubmitPatch(response) {
  if (response?.ok) return { status: "idle", error: null }
  return { status: "idle", error: response?.message ?? "제출하지 못했습니다." }
}

// 밤 판정 요청 응답 → 상태 조각 (성공이면 resolved)
export function computeResolveNightAckPatch(response) {
  if (response?.ok) return { status: "resolved", error: null }
  return { status: "idle", error: response?.message ?? "판정하지 못했습니다." }
}

// 낮으로 넘어갈 때 판정 상태 비우기 (화면이 없으면 null)
export function computeResolveNightDayTransitionPatch(mounted) {
  if (!mounted) return null
  return { status: "idle", error: null }
}

// 판·소켓이 바뀌어 판정 결과를 버릴 때 상태 조각 (화면이 없으면 null)
export function computeResolveNightInvalidatePatch(mounted) {
  if (!mounted) return null
  return { status: "idle", error: null, nightActionResult: null }
}

// 밤 방송이 지금 판 것인지
export function shouldApplyNightBroadcastPayload({ payload, gameId }) {
  if (!gameId) return false
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false
  if (typeof payload.gameId !== "string" || payload.gameId.trim().length === 0) return false
  return payload.gameId === gameId
}
