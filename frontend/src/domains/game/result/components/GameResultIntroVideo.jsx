import { useEffect, useRef, useState } from "react"
import { resolveGameResultIntroVideo } from "../constants/gameResultAssets.js"
import {
  FALLBACK_TIMEOUT_MS,
  SKIP_BTN_CLASS,
  SKIP_LABEL,
} from "../constants/gameResultIntro.js"
import { GAME_RESULT_BG_CLASS, GAME_RESULT_PAGE_CLASS } from "../constants/gameResultLayout.js"
import { publicAsset } from "@/shared/utils/publicAsset"

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
        // 멈춤·되감기 실패는 무시하고 재생은 시도함
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
    }, FALLBACK_TIMEOUT_MS)

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
          className={SKIP_BTN_CLASS}
          onClick={onComplete}
        >
          {SKIP_LABEL}
        </button>
      ) : null}
    </div>
  )
}
