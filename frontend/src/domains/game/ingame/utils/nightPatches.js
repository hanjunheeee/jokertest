// 밤 행동 제출 응답을 상태 조각으로 바꾸기 (아는 거절 코드는 우리말 문구)
// 밤 행동 제출 훅(useInGameNightActionSubmit)이 사용

// 서버 거절 코드별 문구 (서버는 거절에 같은 기본 문구만 실어 줌)
const NIGHT_ACTION_REJECT_MESSAGES = Object.freeze({
  TARGET_IS_ALLY: "동료 광대는 고를 수 없습니다.",
})

// 밤 행동 제출 응답 → 상태 조각 (실패면 문구, 아는 거절 코드면 그 문구 먼저)
export function computeNightActionSubmitPatch(response) {
  if (response?.ok) return { status: "idle", error: null }
  const code = response?.code
  const codeMessage = Object.hasOwn(NIGHT_ACTION_REJECT_MESSAGES, code ?? "") ? NIGHT_ACTION_REJECT_MESSAGES[code] : null
  return { status: "idle", error: codeMessage ?? response?.message ?? "제출하지 못했습니다." }
}
