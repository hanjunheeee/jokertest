import { useCallback, useMemo } from "react"
import { INGAME_PREVIEW_PLAYER_COUNT } from "../constants/board/ingamePlayerBoard.js"
import { INGAME_PLAYER_STATUS } from "../constants/board/status/ingamePlayerStatus.js"
import { resolveInGamePlayerThemeEmphasized } from "../constants/ingamePlayerTheme.js"
import { buildInGamePreviewPlayers } from "../utils/buildInGamePreviewPlayers.js"

/** 백엔드 연동 전 — 첫 슬롯을 로컬 플레이어로 간주 */
export const INGAME_LOCAL_PLAYER_ID = "player-slot-1"

/**
 * 인게임 플레이어 세션 — 서버 상태가 있으면 기존 카드 UI에 맞는 플레이어 목록으로 변환합니다.
 * UI는 판정 로직을 알지 않고, alive/connected/deathReason만 status로 매핑합니다.
 */
export function useInGamePlayerSession(options = INGAME_PREVIEW_PLAYER_COUNT) {
  const normalizedOptions =
    typeof options === "number" ? { playerCount: options } : options

  const {
    playerCount = INGAME_PREVIEW_PLAYER_COUNT,
    sourcePlayers = null,
    localPlayerId = INGAME_LOCAL_PLAYER_ID,
  } = normalizedOptions

  const players = useMemo(() => {
    const count = sourcePlayers?.length ?? playerCount
    const previewPlayers = buildInGamePreviewPlayers(count)

    if (!sourcePlayers?.length) return previewPlayers

    return sourcePlayers.map((player, index) => {
      const preview = previewPlayers[index]
      const status = !player.connected
        ? INGAME_PLAYER_STATUS.DISCONNECTED
        : player.alive
          ? INGAME_PLAYER_STATUS.ALIVE
          : INGAME_PLAYER_STATUS.DEAD

      return {
        ...preview,
        id: player.id,
        nickname: player.name ?? preview.nickname,
        status,
        role: player.role,
        team: player.team,
        deathReason: player.deathReason,
      }
    })
  }, [playerCount, sourcePlayers])

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
    localPlayerId,
    getPlayerById,
    getThemeByPlayerId,
    getThemeStylesByPlayerId,
  }
}
