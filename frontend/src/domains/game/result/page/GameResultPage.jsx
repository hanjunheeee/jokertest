import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import LabelledActionButton from "@/domains/game/mode/components/LabelledActionButton.jsx"
import GameResultIntroVideo from "../components/GameResultIntroVideo.jsx"
import GameResultShell from "../components/GameResultShell.jsx"
import { GAME_RESULT_ASSETS } from "../constants/gameResultAssets.js"
import { GAME_RESULT_LOBBY_BUTTON_REVEAL_DELAY } from "../constants/gameResultEntranceMotion.js"
import {
  GAME_RESULT_LOBBY_BUTTON_LABEL,
  GAME_RESULT_MATCHING_BUTTON_LABEL,
} from "../constants/gameResultLabels.js"
import { GAME_RESULT_LOBBY_BUTTON_WRAP_CLASS } from "../constants/gameResultLayout.js"
import { GAME_RESULT_OUTCOMES } from "../constants/gameResultPreviewData.js"
import { useGameResultData } from "../hooks/useGameResultData.js"
import { useGameResultPreview } from "../hooks/useGameResultPreview.js"
import { useInGameExit } from "@/domains/game/ingame/hooks/useInGameExit.js"
import { useInGameSessionSnapshotSync } from "@/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { useGameResultReturnToMatching } from "../hooks/useGameResultReturnToMatching.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

const RESULT_BOOTSTRAP_HOLD_MS = 6000

const RESULT_PLAIN_BUTTON_CLASS =
  "cursor-pointer border-0 bg-transparent p-0 font-subheading app-text-scaled [--app-text-size:clamp(0.85rem,1.2vw,1.05rem)] font-semibold text-[#f5e6c8] underline decoration-dotted underline-offset-4 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"

const UNAVAILABLE_WRAP_CLASS =
  "absolute inset-0 z-10 flex flex-col items-center justify-center gap-[1.1rem] px-[clamp(1rem,5vw,3rem)] text-center"
const UNAVAILABLE_TITLE_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(1.05rem,2vw,1.6rem)] font-bold text-[#f5e6c8] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]"
const UNAVAILABLE_BODY_CLASS =
  "max-w-[36rem] font-subheading app-text-scaled [--app-text-size:clamp(0.82rem,1.25vw,1rem)] leading-relaxed text-[#f0e0c8]/85"

const RESULT_UNAVAILABLE_TITLE = "게임 결과를 확인할 수 없습니다"
const RESULT_UNAVAILABLE_BODY =
  "이 판의 결과는 화면이 종료까지 받아 둔 값으로만 보여드립니다. 새로고침 등으로 그 값이 사라졌거나 이 계정의 참가 자격이 이미 정리된 경우에는 다시 불러올 수 없습니다."

export default function GameResultPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [introComplete, setIntroComplete] = useState(false)
  const live = useGameResultData()
  const preview = useGameResultPreview()
  const { requestExit } = useInGameExit()
  const { requestReturnToMatching, isReturning } = useGameResultReturnToMatching()

  const bootstrapStatus = useInGameSessionSnapshotSync()

  const hasLiveSession = useInGameStore((s) => Boolean(s.state) && s.state.phase !== "ENDED")
  const previewRequested =
    !hasLiveSession && GAME_RESULT_OUTCOMES.includes(searchParams.get("outcome"))
  const view = live ?? (previewRequested ? preview : null)

  const [holdExpired, setHoldExpired] = useState(false)
  useEffect(() => {
    if (view || bootstrapStatus !== "checking") return undefined
    const timer = window.setTimeout(() => setHoldExpired(true), RESULT_BOOTSTRAP_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [view, bootstrapStatus])

  const bootstrapPending = bootstrapStatus === "checking" && !holdExpired

  useEffect(() => {
    if (!view) return
    setIntroComplete(false)
  }, [view?.outcome])

  if (!view && bootstrapPending) return null

  if (view) {
    if (!introComplete) {
      return (
        <GameResultIntroVideo
          outcome={view.outcome}
          onComplete={() => setIntroComplete(true)}
        />
      )
    }
  }

  return (
    <>
      {view ? (
        <GameResultShell {...view} />
      ) : (
        <div className={UNAVAILABLE_WRAP_CLASS}>
          <p role="alert" className={UNAVAILABLE_TITLE_CLASS}>{RESULT_UNAVAILABLE_TITLE}</p>
          <p className={UNAVAILABLE_BODY_CLASS}>{RESULT_UNAVAILABLE_BODY}</p>
        </div>
      )}
      <motion.div
        className={GAME_RESULT_LOBBY_BUTTON_WRAP_CLASS}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...UI_REVEAL_TRANSITION, delay: GAME_RESULT_LOBBY_BUTTON_REVEAL_DELAY }}
      >
        {view ? (
          <>
            <LabelledActionButton
              src={GAME_RESULT_ASSETS.matchingButton}
              label={GAME_RESULT_MATCHING_BUTTON_LABEL}
              onClick={() => { if (!isReturning) requestReturnToMatching() }}
            />
            <LabelledActionButton
              src={GAME_RESULT_ASSETS.lobbyButton}
              label={GAME_RESULT_LOBBY_BUTTON_LABEL}
              onClick={requestExit}
            />
          </>
        ) : (
          <button
            type="button"
            className={RESULT_PLAIN_BUTTON_CLASS}
            onClick={() => navigate("/multiplay", { replace: true })}
          >
            로비로 돌아가기
          </button>
        )}
      </motion.div>

    </>
  )
}
