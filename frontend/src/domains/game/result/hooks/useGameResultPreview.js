import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import {
  GAME_RESULT_OUTCOMES,
  GAME_RESULT_PREVIEW,
  getMvpPlayer,
} from "../constants/gameResultPreviewData.js"

export function useGameResultPreview() {
  const [searchParams] = useSearchParams()
  const outcomeParam = searchParams.get("outcome")

  return useMemo(() => {
    const outcome = GAME_RESULT_OUTCOMES.includes(outcomeParam)
      ? outcomeParam
      : GAME_RESULT_PREVIEW.outcome

    const players = GAME_RESULT_PREVIEW.players
    const mvp = getMvpPlayer(players, GAME_RESULT_PREVIEW.mvpPlayerId)

    return {
      outcome,
      winningTeam: GAME_RESULT_PREVIEW.winningTeam,
      players,
      selfUuid: GAME_RESULT_PREVIEW.selfPlayerId,
      mvp,
    }
  }, [outcomeParam])
}
