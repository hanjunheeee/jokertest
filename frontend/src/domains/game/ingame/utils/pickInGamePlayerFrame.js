import {
  INGAME_PLAYER_ALIVE_FRAME_VARIANTS,
  INGAME_PLAYER_DEAD_FRAME_VARIANTS,
} from "../constants/board/ingamePlayerAssets.js"
import { INGAME_PLAYER_STATUS } from "../../shared/constants/ingamePlayerStatus.js"
import { pickJobPortrait } from "../../../../shared/utils/pickJobPortrait.js"

export function pickInGamePlayerFrame(index) {
  return pickJobPortrait(index, INGAME_PLAYER_ALIVE_FRAME_VARIANTS)
}

const PLAYER_CARD_ALIVE_DIR = "/shopItem/player-card/playerframe-alive"
const CARD_ITEM_ID_PREFIX = "player-card-"

export function resolveAccountCardFrameSrc(itemId) {
  if (typeof itemId !== "string" || !itemId.startsWith(CARD_ITEM_ID_PREFIX)) return null
  const variant = itemId.slice(CARD_ITEM_ID_PREFIX.length)
  if (!variant) return null
  return `${PLAYER_CARD_ALIVE_DIR}/인게임-플레이어프레임(${variant}).png`.normalize("NFC")
}

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
