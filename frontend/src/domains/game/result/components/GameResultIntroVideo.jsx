// 결과 화면 들어갈 때 승리/패배 연출 영상, 재생이 막히면 건너뛰기 버튼
// GameResultPage가 씀, 끝나거나 건너뛰면 onComplete
import { useEffect, useRef, useState } from "react"
import { resolveGameResultIntroVideo } from "../constants/gameResultAssets.js"
import {
  FALLBACK_TIMEOUT_MS,
  SKIP_BTN_CLASS,
  SKIP_LABEL,
} from "../constants/gameResultIntro.js"
import { GAME_RESULT_BG_CLASS, GAME_RESULT_PAGE_CLASS } from "../constants/gameResultLayout.js"
import { publicAsset } from "@/shared/utils/publicAsset"

// 연출 영상 (소리 없이 자동 재생)
export default function GameResultIntroVideo({ outcome = "win", onComplete }) {
  const videoRef = useRef(null)
  const [showSkip, setShowSkip] = useState(false)

  // 승패 바뀔 때마다 처음부터 다시 재생
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
      // 재생 거절되면(자동 재생 막힘) 건너뛰기 보임
      if (playResult && typeof playResult.then === "function") {
        playResult.catch(() => {
          if (!cancelled) setShowSkip(true)
        })
      }
    }

    // 영상이 안 끝나도 20초 뒤엔 건너뛰기 보임
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
      {/* 건너뛰기는 재생 실패·오류·20초 지남일 때만 */}
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
