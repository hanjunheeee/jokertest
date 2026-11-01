// 순번으로 직업 클로즈업 초상 하나 고르기 (목록 길이로 돌려 씀)
// ingame 초상·틀 고르기와 result 화면 모양 만들기가 씀
import { JOB_CLOSEUP_PORTRAITS } from "../constants/playerPortraitAssets.js"

// 사람 수가 초상 수보다 많으면 처음부터 다시 씀
export function pickJobPortrait(index, portraits = JOB_CLOSEUP_PORTRAITS) {
  // 빈 목록이면 undefined (0으로 나누기 막기)
  if (!portraits.length) return undefined
  return portraits[index % portraits.length]
}
