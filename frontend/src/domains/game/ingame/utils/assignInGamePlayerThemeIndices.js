import { INGAME_PLAYER_THEME_PALETTE_SIZE } from "../constants/ingamePlayerTheme.js"

function shuffleIndices(length) {
  const indices = Array.from({ length }, (_, index) => index)

  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }

  return indices
}

/**
 * 매 판 시작 — 팔레트 순서 셔플 후 playerCount만큼 순환 배정.
 * @param {number} playerCount
 * @returns {number[]} paletteIndex per player slot
 */
export function assignInGamePlayerThemeIndices(playerCount) {
  const rotatedOrder = shuffleIndices(INGAME_PLAYER_THEME_PALETTE_SIZE)

  return Array.from(
    { length: playerCount },
    (_, index) => rotatedOrder[index % INGAME_PLAYER_THEME_PALETTE_SIZE],
  )
}
