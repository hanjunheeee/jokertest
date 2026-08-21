/**
 * 밤 행동 제출 ack 응답(또는 실패)이 도착했을 때 반영할 상태를 계산한다.
 * 성공하면 status:'submitted'로 잠긴다 — 같은 역할 턴 안에서 조용한 중복 제출을 막기 위함이다
 * (그 턴이 실제로 끝나면 useInGameNightActionSubmit이 canonical 턴 정체성 변화를 감지해
 * 'idle'로 되돌린다). 실패하면 재시도할 수 있도록 항상 status:'idle'을 반환한다.
 */
export function computeNightActionSubmitPatch(response) {
  if (response?.ok) return { status: "submitted", error: null }
  return { status: "idle", error: response?.message ?? "제출하지 못했습니다." }
}
