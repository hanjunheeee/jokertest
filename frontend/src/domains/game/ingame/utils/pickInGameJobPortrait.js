import { INGAME_JOB_STANDING_PORTRAITS } from "../constants/ingamePlayerAssets.js"

/** 슬롯 index 기준 더미 직업 전신 PNG 순환 */
export function pickInGameJobPortrait(index) {
  return INGAME_JOB_STANDING_PORTRAITS[
    index % INGAME_JOB_STANDING_PORTRAITS.length
  ]
}
