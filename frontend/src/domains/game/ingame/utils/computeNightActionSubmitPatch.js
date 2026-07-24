/**
 * 밤 행동 제출 ack 응답(또는 실패)이 도착했을 때 반영할 상태를 계산한다.
 * role-reveal의 computeRoleRevealInvalidatePatch와 달리 성공/실패 어느 쪽이든 항상
 * status:'idle'을 반환한다 — 재제출이 항상 허용되는 정책이라 role-reveal처럼 'acked'로
 * 잠그지 않는다.
 */
export function computeNightActionSubmitPatch(response) {
  if (response?.ok) return { status: "idle", error: null }
  return { status: "idle", error: response?.message ?? "제출하지 못했습니다." }
}
