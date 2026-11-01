// 플레이어 세션 훅: 판 참가자를 미리보기 칸에 덧입히고, id로 사람·테마 찾기
// 플레이어 세션 Provider(InGamePlayerSessionProvider)가 사용
import { useCallback, useMemo } from "react"
import { INGAME_PREVIEW_PLAYER_COUNT } from "../constants/board/ingamePlayerBoard.js"
import { resolveThemeEmphasized } from "../../../../shared/constants/ingamePlayerTheme.js"
import { buildInGamePreviewPlayers } from "../utils/buildInGamePreviewPlayers.js"
import { mergeSourcePlayerWithPreview } from "../utils/mergeSourcePlayerWithPreview.js"

// 판 정보 없을 때 내 자리로 볼 미리보기 칸 id
export const INGAME_LOCAL_PLAYER_ID = "player-slot-1"

// 사람 목록과 id로 찾기·테마 함수 (숫자만 주면 사람 수로 봄)
export function useInGamePlayerSession(options = INGAME_PREVIEW_PLAYER_COUNT) {
  const normalizedOptions =
    typeof options === "number" ? { playerCount: options } : options

  const {
    playerCount = INGAME_PREVIEW_PLAYER_COUNT,
    sourcePlayers = null,
    localPlayerId = INGAME_LOCAL_PLAYER_ID,
  } = normalizedOptions

  // 판 참가자가 있으면 미리보기 칸에 덮어쓰고, 없으면 미리보기 칸만
  const players = useMemo(() => {
    const count = sourcePlayers?.length ?? playerCount
    const previewPlayers = buildInGamePreviewPlayers(count)

    if (!sourcePlayers?.length) return previewPlayers

    return sourcePlayers.map((player, index) => mergeSourcePlayerWithPreview(player, previewPlayers[index]))
  }, [playerCount, sourcePlayers])

  // id로 사람·테마 찾기
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

  // 강조면 강조 테마 색, 아니면 기본 테마 색 (없는 사람은 null)
  const getThemeStylesByPlayerId = useCallback(
    (playerId, options) => {
      const player = getPlayerById(playerId)
      if (!player) return null

      if (options?.emphasized) {
        return resolveThemeEmphasized(player.themeIndex).styles
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
