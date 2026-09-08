import { useEffect, useRef, useState } from "react"
import { resolveGameResultIntroVideo } from "../constants/gameResultAssets.js"
import {
  GAME_RESULT_INTRO_FALLBACK_TIMEOUT_MS,
  GAME_RESULT_INTRO_SKIP_BUTTON_CLASS,
  GAME_RESULT_INTRO_SKIP_LABEL,
} from "../constants/gameResultIntro.js"
import { GAME_RESULT_BG_CLASS, GAME_RESULT_PAGE_CLASS } from "../constants/gameResultLayout.js"
import { publicAsset } from "@/shared/utils/publicAsset"

/**
 * 게임 결과창 진입 전 승/패 연출 영상 — ended 시 onComplete, 오류·지연 시 건너뛰기.
 * 상점·설정 진입 영상처럼 viewport-shell 중앙 게임 열 안에서만 재생한다.
 * @param {"win" | "lose"} outcome
 * @param {() => void} onComplete
 */
export default function GameResultIntroVideo({ outcome = "win", onComplete }) {
  const videoRef = useRef(null)
  const [showSkip, setShowSkip] = useState(false)

  useEffect(() => {
    let cancelled = false
    setShowSkip(false)

    const video = videoRef.current
    if (video) {
      try {
        video.pause()
        video.currentTime = 0
      } catch {
        // metadata 전 currentTime 대입 실패는 무시
      }
      const playResult = video.play()
      if (playResult && typeof playResult.then === "function") {
        playResult.catch(() => {
          if (!cancelled) setShowSkip(true)
        })
      }
    }

    const watchdog = setTimeout(() => {
      if (!cancelled) setShowSkip(true)
    }, GAME_RESULT_INTRO_FALLBACK_TIMEOUT_MS)

    return () => {
      cancelled = true
      clearTimeout(watchdog)
    }
  }, [outcome])

  return (
    <div className={GAME_RESULT_PAGE_CLASS} data-game-result-intro={outcome}>
      <video
        ref={videoRef}
        className={GAME_RESULT_BG_CLASS}
        src={publicAsset(resolveGameResultIntroVideo(outcome))}
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={onComplete}
        onError={() => setShowSkip(true)}
      />
      {showSkip ? (
        <button
          type="button"
          className={GAME_RESULT_INTRO_SKIP_BUTTON_CLASS}
          onClick={onComplete}
        >
          {GAME_RESULT_INTRO_SKIP_LABEL}
        </button>
      ) : null}
    </div>
  )
}
