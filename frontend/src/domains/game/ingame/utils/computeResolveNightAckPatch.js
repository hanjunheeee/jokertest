/**
 * resolve_night ack 응답(또는 실패)이 도착했을 때 반영할 상태를 계산한다.
 * computeNightActionSubmitPatch와 달리 성공 시 'resolved'로 잠근다 — 판정은 게임당 한 번만
 * 유효하므로 재요청을 허용하지 않는 정책과 일치한다. 실패 시에는 'idle'로 되돌려 재시도할 수
 * 있게 한다.
 */
export function computeResolveNightAckPatch(response) {
  if (response?.ok) return { status: "resolved", error: null }
  return { status: "idle", error: response?.message ?? "판정하지 못했습니다." }
}
