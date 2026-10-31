import { JOB_CLOSEUP_PORTRAITS } from "../../../../shared/constants/playerPortraitAssets.js"
import { pickJobPortrait } from "../../../../shared/utils/pickJobPortrait.js"

export function pickInGameJobPortrait(index) {
  return pickJobPortrait(index, JOB_CLOSEUP_PORTRAITS)
}
