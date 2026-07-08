import {
  INGAME_PLAYER_ALIVE_FRAME_VARIANTS,
  INGAME_PLAYER_DEAD_FRAME_VARIANTS,
} from "../constants/board/ingamePlayerAssets.js"
import { INGAME_PLAYER_STATUS } from "../constants/board/status/ingamePlayerStatus.js"
import { pickJobPortrait } from "@/shared/utils/pickJobPortrait.js"

/** 슬롯 index 기준 더미 alive 프레임 PNG 순환 */
export function pickInGamePlayerFrame(index) {
  return pickJobPortrait(index, INGAME_PLAYER_ALIVE_FRAME_VARIANTS)
}

/**
 * alive 프레임 + status → 표시용 프레임 경로
 * @param {string} aliveFrameSrc
 * @param {import("../constants/board/status/ingamePlayerStatus.js").InGamePlayerStatus} status
 */
export function resolveInGamePlayerFrameSrc(aliveFrameSrc, status) {
  if (status !== INGAME_PLAYER_STATUS.DEAD) {
    return aliveFrameSrc
  }

  const variantIndex = INGAME_PLAYER_ALIVE_FRAME_VARIANTS.indexOf(aliveFrameSrc)

  if (variantIndex < 0) {
    return INGAME_PLAYER_DEAD_FRAME_VARIANTS[0]
  }

  return INGAME_PLAYER_DEAD_FRAME_VARIANTS[
    variantIndex % INGAME_PLAYER_DEAD_FRAME_VARIANTS.length
  ]
}
