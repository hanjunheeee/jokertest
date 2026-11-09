// 게임 결과 화면: 연출 영상 → 결과(실제 판 또는 미리보기) → 대기방·로비 버튼
// /gameresult 라우트가 씀, 그릴 결과가 없으면 확인 불가 안내만 보여 줌
import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import LabelledActionButton from "@/domains/game/shared/components/LabelledActionButton.jsx"
import GameResultIntroVideo from "../components/GameResultIntroVideo.jsx"
import GameResultShell from "../components/GameResultShell.jsx"
import { GAME_RESULT_ASSETS } from "../constants/gameResultAssets.js"
import { LOBBY_BTN_REVEAL_DELAY } from "../constants/gameResultEntranceMotion.js"
import {
  GAME_RESULT_LOBBY_BUTTON_LABEL,
  GAME_RESULT_MATCHING_BUTTON_LABEL,
  GAME_RESULT_MATCHING_PENDING_LABEL,
} from "../constants/gameResultLabels.js"
import { LOBBY_BTN_WRAP_CLASS } from "../constants/gameResultLayout.js"
import { GAME_RESULT_OUTCOMES } from "../constants/gameResultPreviewData.js"
import {
  BOOTSTRAP_HOLD_MS,
  PLAIN_BTN_CLASS,
  RESULT_UNAVAILABLE_BODY,
  RESULT_UNAVAILABLE_TITLE,
  UNAVAILABLE_BODY_CLASS,
  UNAVAILABLE_TITLE_CLASS,
  UNAVAILABLE_WRAP_CLASS,
} from "../constants/gameResultUnavailable.js"
import { useGameResultData } from "../hooks/useGameResultData.js"
import { useGameResultPreview } from "../hooks/useGameResultPreview.js"
import { useInGameExit } from "@/domains/game/ingame/hooks/useInGameExit.js"
import { useInGameSessionSnapshotSync } from "@/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { useGameResultReturnToMatching } from "../hooks/useGameResultReturnToMatching.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

export default function GameResultPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [introComplete, setIntroComplete] = useState(false)
  const live = useGameResultData()
  const preview = useGameResultPreview()
  // "로비로" 버튼은 이름대로 로비로 감 (판 중 나가기는 멀티 화면)
  const { requestExit } = useInGameExit({ destination: "/lobby" })
  const { requestReturnToMatching, isReturning } = useGameResultReturnToMatching()

  const bootstrapStatus = useInGameSessionSnapshotSync()

  const hasLiveSession = useInGameStore((s) => Boolean(s.state) && s.state.phase !== "ENDED")
  const previewRequested =
    !hasLiveSession && GAME_RESULT_OUTCOMES.includes(searchParams.get("outcome"))
  const view = live ?? (previewRequested ? preview : null)

  const [holdExpired, setHoldExpired] = useState(false)
  useEffect(() => {
    if (view || bootstrapStatus !== "checking") return undefined
    const timer = window.setTimeout(() => setHoldExpired(true), BOOTSTRAP_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [view, bootstrapStatus])

  const bootstrapPending = bootstrapStatus === "checking" && !holdExpired

  // 결과 종류가 바뀌면 연출을 다시 봄 (그리는 중에 앞 값과 비교해 바로 맞춤)
  const outcome = view?.outcome ?? null
  const [introOutcome, setIntroOutcome] = useState(outcome)
  if (outcome !== null && outcome !== introOutcome) {
    setIntroOutcome(outcome)
    setIntroComplete(false)
  }

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
        className={LOBBY_BTN_WRAP_CLASS}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...UI_REVEAL_TRANSITION, delay: LOBBY_BTN_REVEAL_DELAY }}
      >
        {view ? (
          <>
            {/* 대기방 가는 중엔 두 버튼 다 잠금 (늦은 응답이 로비 간 뒤 대기방으로 끌고 가지 않게) */}
            <LabelledActionButton
              src={GAME_RESULT_ASSETS.matchingButton}
              label={isReturning ? GAME_RESULT_MATCHING_PENDING_LABEL : GAME_RESULT_MATCHING_BUTTON_LABEL}
              disabled={isReturning}
              onClick={() => { if (!isReturning) requestReturnToMatching() }}
            />
            <LabelledActionButton
              src={GAME_RESULT_ASSETS.lobbyButton}
              label={GAME_RESULT_LOBBY_BUTTON_LABEL}
              disabled={isReturning}
              onClick={() => { if (!isReturning) requestExit() }}
            />
          </>
        ) : (
          <button
            type="button"
            className={PLAIN_BTN_CLASS}
            onClick={() => navigate("/lobby", { replace: true })}
          >
            로비로 돌아가기
          </button>
        )}
      </motion.div>

    </>
  )
}
