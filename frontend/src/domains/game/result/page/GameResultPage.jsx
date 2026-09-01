/**
 * 게임 결과 화면 — prototype 게임 결과창 시안-승리/패배.png
 *
 * 실제 게임이 끝나면 store에 남아 있는 winResult(전원 정체 공개 + 승리 진영)로 그린다.
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
import { useGameResultLobbyExit } from "../hooks/useGameResultLobbyExit.js"
import { useGameResultPreview } from "../hooks/useGameResultPreview.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

/**
 * 결과 페이지 최상위 — 실데이터를 우선하고, 없으면 `?outcome=` 미리보기, 둘 다 없으면 로비로 보낸다.
 */
export default function GameResultPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [introComplete, setIntroComplete] = useState(false)
  const live = useGameResultData()
  const preview = useGameResultPreview()
  const requestLobbyExit = useGameResultLobbyExit()

  const previewRequested = GAME_RESULT_OUTCOMES.includes(searchParams.get("outcome"))
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
          onClick={requestLobbyExit}
        />
      </motion.div>
    </>
  )
}
