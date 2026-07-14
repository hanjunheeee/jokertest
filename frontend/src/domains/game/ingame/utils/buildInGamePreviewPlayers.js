// 파일 역할: buildInGamePreviewPlayers.js - 여러 곳에서 재사용하는 유틸 함수입니다.
import { INGAME_PREVIEW_PLAYER_COUNT } from "../constants/board/ingamePlayerBoard.js"
import { getPreviewPlayerStatus } from "../constants/board/status/ingamePlayerStatus.js"
import { resolveInGamePlayerTheme } from "../constants/ingamePlayerTheme.js"
import { assignInGamePlayerThemeIndices } from "./assignInGamePlayerThemeIndices.js"
import { pickInGameJobPortrait } from "./pickInGameJobPortrait.js"
import { pickInGamePlayerFrame } from "./pickInGamePlayerFrame.js"

/**
 * 더미 인게임 플레이어 목록 — 초상·프레임·상태·테마(매 호출 시 팔레트 셔플) 포함.
 * @param {number} [count=INGAME_PREVIEW_PLAYER_COUNT]
 */
export function buildInGamePreviewPlayers(
  count = INGAME_PREVIEW_PLAYER_COUNT,
) {
  const themeIndices = assignInGamePlayerThemeIndices(count)

  return Array.from({ length: count }, (_, index) => {
    const themeIndex = themeIndices[index]

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
