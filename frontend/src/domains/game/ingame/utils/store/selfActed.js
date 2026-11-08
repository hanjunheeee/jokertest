// 단계가 바뀔 때 "이번 단계에 이미 함" 표시 풀기 (스냅샷만 값을 넣어서 안 풀면 다음 단계까지 남음)
// 단계·투표 결과 액션(store/ingame/phaseActions.js·voteActions.js)이 사용

// 판 상태에 펼쳐 넣을 조각: 이미 함 표시가 켜져 있을 때만 본인 정보를 새로 만듦, 아니면 빈 조각
export function clearSelfActed(state) {
  const self = state?.self
  if (!self || self.hasActedThisPhase !== true) return {}
  return { self: { ...self, hasActedThisPhase: false } }
}
