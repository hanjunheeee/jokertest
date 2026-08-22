/**
 * 게임 결과 화면 — prototype 게임 결과창 시안-승리/패배.png
 *
 * 실제 게임이 끝나면 store에 남아 있는 winResult(전원 정체 공개 + 승리 진영)로 그린다.
 * 개발: /gameresult?outcome=win | /gameresult?outcome=lose (실데이터가 없을 때만 쓰이는 더미)
 */
import { useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import GameResultShell from "../components/GameResultShell.jsx"
import { GAME_RESULT_OUTCOMES } from "../constants/gameResultPreviewData.js"
import { useGameResultData } from "../hooks/useGameResultData.js"
import { useGameResultPreview } from "../hooks/useGameResultPreview.js"

/**
 * 결과 페이지 최상위 — 실데이터를 우선하고, 없으면 `?outcome=` 미리보기, 둘 다 없으면 로비로 보낸다.
 * @flow 훅은 분기 없이 항상 같은 순서로 호출한 뒤(호출 순서 고정), 무엇을 그릴지는 그 결과로만
 *   고른다. 그릴 것이 없으면(새로고침 등으로 store가 빈 채 직접 진입) 인게임 화면과 같은 관례로
 *   /multiplay로 replace 이동한다 — 세션 종료 finalizer가 쓰는 바로 그 로비 경로다.
 */
export default function GameResultPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const live = useGameResultData()
  const preview = useGameResultPreview()

  const previewRequested = GAME_RESULT_OUTCOMES.includes(searchParams.get("outcome"))
  const view = live ?? (previewRequested ? preview : null)

  useEffect(() => {
    if (view) return
    navigate("/multiplay", { replace: true })
  }, [view, navigate])

  if (!view) return null

  return <GameResultShell {...view} />
}