// 밤 결과 연출 액션 묶음: 밤 개인 결과 넣기·지우기, 낮 시작 연출 다 봄
// 입구 파일이 create 할 때 펼쳐 씀 (낮 시작 연출 넣기는 밤 결과 적용 액션이 같이 함)
import {
  CLEARED_DAWN_REPORT,
  CLEARED_NIGHT_PRIVATE_RESULT,
} from "../../constants/store/ingameStore.js"

export const nightResultActions = (set) => ({
  // 밤 개인 결과 넣기 (지금 판 것만)
  setNightPrivateResult: (parsed) =>
    set((current) => {
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return current
      if (!current.gameId || parsed.gameId !== current.gameId) return current
      return { nightPrivateResult: parsed }
    }),

  // 밤 개인 결과 지우기 (이미 비었으면 그대로)
  clearNightPrivateResult: () =>
    set((current) => (current.nightPrivateResult === null ? current : CLEARED_NIGHT_PRIVATE_RESULT)),

  // 낮 시작 연출 다 봄 (보던 그 연출일 때만 지움, 그사이 새 연출로 바뀌었으면 그대로)
  finishDawnReport: (key) =>
    set((current) => (current.dawnReport !== null && current.dawnReport.key === key ? CLEARED_DAWN_REPORT : current)),
})
