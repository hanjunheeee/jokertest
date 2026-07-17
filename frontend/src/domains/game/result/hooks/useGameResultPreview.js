import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import {
  GAME_RESULT_OUTCOMES,
  GAME_RESULT_PREVIEW,
  getGameResultMvpPlayer,
} from "../constants/gameResultPreviewData.js"

/** 개발용 — URL `?outcome=win|lose` 우선, 없으면 preview 기본값 */
export function useGameResultPreview() {
  const [searchParams] = useSearchParams()
  const outcomeParam = searchParams.get("outcome")

  return useMemo(() => {
    const outcome = GAME_RESULT_OUTCOMES.includes(outcomeParam)
      ? outcomeParam
      : GAME_RESULT_PREVIEW.outcome

    const players = GAME_RESULT_PREVIEW.players
    const mvp = getGameResultMvpPlayer(players, GAME_RESULT_PREVIEW.mvpPlayerId)

    return { outcome, players, mvp }
  }, [outcomeParam])
}
