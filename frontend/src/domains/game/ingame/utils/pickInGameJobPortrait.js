// 칸 번호로 직업 근접 초상 고르기 (번호가 넘치면 처음부터 돌아감)
// 미리보기 참가자 만들기와 결과 화면 자료·결과 화면 값 만들기가 사용
import { JOB_CLOSEUP_PORTRAITS } from "../../../../shared/constants/playerPortraitAssets.js"
import { pickJobPortrait } from "../../../../shared/utils/pickJobPortrait.js"

// 인게임은 근접 초상 목록에서 고름
export function pickInGameJobPortrait(index) {
  return pickJobPortrait(index, JOB_CLOSEUP_PORTRAITS)
}
