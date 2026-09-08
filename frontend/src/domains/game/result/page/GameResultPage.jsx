/**
 * 게임 결과 화면 — prototype 게임 결과창 시안-승리/패배.png
 *
 * 실제 게임이 끝나면 store에 남아 있는 winResult(승리 진영)로 그린다.
 * 개발: /gameresult?outcome=win | /gameresult?outcome=lose (실데이터가 없을 때만 쓰이는 더미)
 */
import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import LabelledActionButton from "@/domains/game/mode/components/LabelledActionButton.jsx"
import GameResultIntroVideo from "../components/GameResultIntroVideo.jsx"
import GameResultShell from "../components/GameResultShell.jsx"
import { GAME_RESULT_ASSETS } from "../constants/gameResultAssets.js"
import { GAME_RESULT_LOBBY_BUTTON_REVEAL_DELAY } from "../constants/gameResultEntranceMotion.js"
import { GAME_RESULT_LOBBY_BUTTON_WRAP_CLASS } from "../constants/gameResultLayout.js"
import { GAME_RESULT_OUTCOMES } from "../constants/gameResultPreviewData.js"
import { useGameResultData } from "../hooks/useGameResultData.js"
import { useGameResultPreview } from "../hooks/useGameResultPreview.js"
import { useInGameExit } from "@/domains/game/ingame/hooks/useInGameExit.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

/**
 * 결과 페이지 최상위 — 실데이터를 우선하고, 없으면 `?outcome=` 미리보기, 둘 다 없으면 로비로 보낸다.
 *
 * 로비 복귀는 결과 화면 전용 이탈 경로를 새로 만들지 않고 기존 인게임 종료 경로
 * (useInGameExit → createLeaveGameSessionRequest → createSessionEndFinalizer)를 그대로 쓴다 —
 * 이탈 요청·store 정리·/multiplay 이동 계약이 인게임 나가기와 한 곳에서 갈리지 않는다.
 */
export default function GameResultPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [introComplete, setIntroComplete] = useState(false)
  const live = useGameResultData()
  const preview = useGameResultPreview()
  const { requestExit } = useInGameExit()

  // 아직 끝나지 않은 게임이 store에 남아 있으면 `?outcome=`으로도 결과·역할 공개를 미리
  // 보여주지 않는다 — 더미 명단이라도 진행 중인 판에서는 결과 화면 자체가 열리면 안 된다.
  const hasLiveSession = useInGameStore((s) => Boolean(s.state) && s.state.phase !== "ENDED")
  const previewRequested =
    !hasLiveSession && GAME_RESULT_OUTCOMES.includes(searchParams.get("outcome"))
  const view = live ?? (previewRequested ? preview : null)

  useEffect(() => {
    if (view) return
    navigate("/multiplay", { replace: true })
  }, [view, navigate])

  useEffect(() => {
    if (!view) return
    setIntroComplete(false)
  }, [view?.outcome])

  if (!view) return null

  if (!introComplete) {
    return (
      <GameResultIntroVideo
        outcome={view.outcome}
        onComplete={() => setIntroComplete(true)}
      />
    )
  }

  return (
    <>
      <GameResultShell {...view} />
      <motion.div
        className={GAME_RESULT_LOBBY_BUTTON_WRAP_CLASS}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...UI_REVEAL_TRANSITION, delay: GAME_RESULT_LOBBY_BUTTON_REVEAL_DELAY }}
      >
        <LabelledActionButton
          src={GAME_RESULT_ASSETS.lobbyButton}
          label="로비로"
          onClick={requestExit}
        />
      </motion.div>
    </>
  )
}
