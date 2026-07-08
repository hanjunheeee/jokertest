import { useCallback, useMemo, useState } from "react"
import { INGAME_PREVIEW_PLAYER_COUNT } from "../constants/board/ingamePlayerBoard.js"
import { resolveInGamePlayerThemeEmphasized } from "../constants/ingamePlayerTheme.js"
import { buildInGamePreviewPlayers } from "../utils/buildInGamePreviewPlayers.js"

/** 백엔드 연동 전 — 첫 슬롯을 로컬 플레이어로 간주 */
export const INGAME_LOCAL_PLAYER_ID = "player-slot-1"

/**
 * 인게임 플레이어 세션 — 매 판 1회 테마 배정·플레이어 목록.
 * 추후 room/socket 데이터로 players만 교체하면 됩니다.
 */
export function useInGamePlayerSession(
  playerCount = INGAME_PREVIEW_PLAYER_COUNT,
) {
  const [players] = useState(() => buildInGamePreviewPlayers(playerCount))

  const playersById = useMemo(
    () => Object.fromEntries(players.map((player) => [player.id, player])),
    [players],
  )

  const getPlayerById = useCallback(
    (playerId) => playersById[playerId] ?? null,
    [playersById],
  )

  const getThemeByPlayerId = useCallback(
    (playerId) => getPlayerById(playerId)?.theme ?? null,
    [getPlayerById],
  )

  const getThemeStylesByPlayerId = useCallback(
    (playerId, options) => {
      const player = getPlayerById(playerId)
      if (!player) return null

      if (options?.emphasized) {
        return resolveInGamePlayerThemeEmphasized(player.themeIndex).styles
      }

      return player.theme.styles
    },
    [getPlayerById],
  )

  return {
    players,
    localPlayerId: INGAME_LOCAL_PLAYER_ID,
    getPlayerById,
    getThemeByPlayerId,
    getThemeStylesByPlayerId,
  }
}
