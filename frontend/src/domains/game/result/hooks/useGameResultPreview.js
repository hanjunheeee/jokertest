// 결과 화면 미리보기 값 (주소의 ?outcome= 따라 승패만 바꿈), 운영 빌드에서는 값 없음
// GameResultPage·모바일 결과 화면 훅이 씀, 실제 결과가 없을 때만 페이지가 고름
import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import {
  GAME_RESULT_OUTCOMES,
  GAME_RESULT_PREVIEW,
} from "../constants/gameResultPreviewData.js"
import { isResultPreviewAllowed } from "../utils/previewGate.js"

// 미리보기 화면 값 (모르는 outcome이면 가짜 판 기본값)
// 운영 빌드면 null → 주소에 ?outcome= 을 붙여도 "결과를 확인할 수 없습니다" 화면이 나옴 (사용자 결정 2026-11-16)
export function useGameResultPreview() {
  const [searchParams] = useSearchParams()
  const outcomeParam = searchParams.get("outcome")
  const allowed = isResultPreviewAllowed()

  return useMemo(() => {
    if (!allowed) return null

    const outcome = GAME_RESULT_OUTCOMES.includes(outcomeParam)
      ? outcomeParam
      : GAME_RESULT_PREVIEW.outcome

    const players = GAME_RESULT_PREVIEW.players

    return {
      outcome,
      winningTeam: GAME_RESULT_PREVIEW.winningTeam,
      players,
      selfUuid: GAME_RESULT_PREVIEW.selfPlayerId,
    }
  }, [outcomeParam, allowed])
}
