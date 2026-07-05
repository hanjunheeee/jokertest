import { JOB_CLOSEUP_PORTRAITS } from "../constants/playerPortraitAssets.js"

/**
 * index를 portraits 배열 길이로 순환(modulo)시켜 해당 직업 초상 경로를 반환합니다.
 * @param {number} index
 * @param {string[]} portraits
 */
export function pickJobPortrait(index, portraits = JOB_CLOSEUP_PORTRAITS) {
  if (!portraits.length) return undefined
  return portraits[index % portraits.length]
}
