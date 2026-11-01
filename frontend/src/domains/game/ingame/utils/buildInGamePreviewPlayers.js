import { INGAME_PREVIEW_PLAYER_COUNT } from "../constants/board/ingamePlayerBoard.js"
import { getPreviewPlayerStatus } from "../../shared/constants/ingamePlayerStatus.js"
import {
  INGAME_PLAYER_THEME_PALETTE_SIZE,
  resolveInGamePlayerTheme,
} from "../../../../shared/constants/ingamePlayerTheme.js"
import { pickInGameJobPortrait } from "./pickInGameJobPortrait.js"
import { pickInGamePlayerFrame } from "./pickInGamePlayerFrame.js"

export function buildInGamePreviewPlayers(
  count = INGAME_PREVIEW_PLAYER_COUNT,
) {
  return Array.from({ length: count }, (_, index) => {
    const themeIndex = index % INGAME_PLAYER_THEME_PALETTE_SIZE

    return {
      id: `player-slot-${index + 1}`,
      nickname: `플레이어 ${index + 1}`,
      portraitSrc: pickInGameJobPortrait(index),
      frameSrc: pickInGamePlayerFrame(index),
      status: getPreviewPlayerStatus(index),
      themeIndex,
      theme: resolveInGamePlayerTheme(themeIndex),
    }
  })
}
