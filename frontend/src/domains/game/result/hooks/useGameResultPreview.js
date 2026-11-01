// 결과 화면 미리보기 값 (주소의 ?outcome= 따라 승패만 바꿈)
// GameResultPage가 씀, 실제 결과가 없을 때만 페이지가 고름
import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import {
  GAME_RESULT_OUTCOMES,
  GAME_RESULT_PREVIEW,
  getMvpPlayer,
} from "../constants/gameResultPreviewData.js"

// 미리보기 화면 값 (모르는 outcome이면 가짜 판 기본값)
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
