// 역할 공개 단계인지 (입장 준비 연출·조작 잠금에 사용)

export function selectInGameEntryPreparingActive(state) {
  return state?.phase === "ROLE_REVEAL"
}