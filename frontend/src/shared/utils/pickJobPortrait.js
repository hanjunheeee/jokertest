import { JOB_CLOSEUP_PORTRAITS } from "../constants/playerPortraitAssets.js"

/**
 * @param {number} index
 * @param {string[]} portraits
 */
export function pickJobPortrait(index, portraits = JOB_CLOSEUP_PORTRAITS) {
  if (!portraits.length) return undefined
  return portraits[index % portraits.length]
}
