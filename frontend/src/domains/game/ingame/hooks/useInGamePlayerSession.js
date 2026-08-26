import { useCallback, useMemo } from "react"
import { INGAME_PREVIEW_PLAYER_COUNT } from "../constants/board/ingamePlayerBoard.js"
import { resolveInGamePlayerThemeEmphasized } from "../constants/ingamePlayerTheme.js"
import { buildInGamePreviewPlayers } from "../utils/buildInGamePreviewPlayers.js"
import { mergeSourcePlayerWithPreview } from "../utils/mergeSourcePlayerWithPreview.js"

/** 백엔드 연동 전 — 첫 슬롯을 로컬 플레이어로 간주 */
export const INGAME_LOCAL_PLAYER_ID = "player-slot-1"

/**
 * 인게임 플레이어 세션 — 서버 상태가 있으면 기존 카드 UI에 맞는 플레이어 목록으로 변환합니다.
 * UI는 판정 로직을 알지 않고, alive/connected/deathReason만 status로 매핑합니다.
 *
 * 색도 마찬가지로 UI가 정하지 않습니다 — 서버 colorIndex로 결정된 테마를 그대로 넘겨주고,
 * 색이 없는 참가자(구세션 등)에게는 null을 돌려줘 소비처가 기존 기본색으로 그리게 합니다.
 * @param {object|number} [options] playerCount만 줄 때는 숫자, 서버 연동 시 { playerCount,
 *   sourcePlayers, localPlayerId } 객체
 * @flow sourcePlayers가 있으면 같은 길이의 preview와 병합하고, 없으면 preview를 그대로 쓴다.
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

    return sourcePlayers.map((player, index) => mergeSourcePlayerWithPreview(player, previewPlayers[index]))
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

  // 색이 없는 참가자(colorIndex 미제공)는 theme·themeIndex가 모두 null이다 — 여기서 null을
  // 그대로 돌려줘야 카드·채팅·투표·전적 패널이 테마 색 없이 기본색으로 그린다(옵셔널 체이닝
  // 없이 player.theme.styles를 읽으면 그 참가자 하나 때문에 화면 전체가 TypeError로 죽는다).
  const getThemeStylesByPlayerId = useCallback(
    (playerId, options) => {
      const player = getPlayerById(playerId)
      if (!player) return null

      if (options?.emphasized) {
        if (!Number.isInteger(player.themeIndex)) return null
        return resolveInGamePlayerThemeEmphasized(player.themeIndex).styles
      }

      return player.theme?.styles ?? null
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
