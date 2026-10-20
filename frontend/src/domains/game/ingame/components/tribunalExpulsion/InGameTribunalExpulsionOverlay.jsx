import { useCallback, useEffect, useRef, useState } from "react"
import {
  INGAME_TRIBUNAL_EXPULSION_BACKDROP_CLASS,
  INGAME_TRIBUNAL_EXPULSION_FADE_LAYER_CLASS,
  INGAME_TRIBUNAL_EXPULSION_FADE_MS,
  INGAME_TRIBUNAL_EXPULSION_HOLD_MS,
  INGAME_TRIBUNAL_EXPULSION_MESSAGE_AUTO_MS,
  INGAME_TRIBUNAL_EXPULSION_MESSAGE_CLASS,
  INGAME_TRIBUNAL_EXPULSION_VIDEO_CLASS,
  INGAME_TRIBUNAL_EXPULSION_VIDEO_URL,
  INGAME_TRIBUNAL_EXPULSION_VIDEO_WRAP_CLASS,
} from "../../constants/tribunalExpulsion/ingameTribunalExpulsionPresentation.js"

/**
 * TRIBUNAL GUILTY 추방 연출 — 게임 열 기준 영상(80%) → 마지막 프레임 고정 → 어둡게 페이드 → 신라문화체 안내.
 * InGamePage(relative) 안에서 absolute로 그려져 좌우 배너를 침범하지 않는다.
 */
export default function InGameTribunalExpulsionOverlay({
  open = false,
  presentationId = null,
  message = null,
  onComplete = null,
}) {
  const videoRef = useRef(null)
  const [phase, setPhase] = useState("playing")
  const [fadeOpacity, setFadeOpacity] = useState(0)

  const active = Boolean(open) && typeof presentationId === "string" && presentationId.length > 0

  useEffect(() => {
    if (!active) {
      setPhase("playing")
      setFadeOpacity(0)
      return undefined
    }

    setPhase("playing")
    setFadeOpacity(0)

    const video = videoRef.current
    if (!video) return undefined

    video.currentTime = 0
    const playPromise = video.play()
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        setPhase("hold")
      })
    }

    return undefined
  }, [active, presentationId])

  const finish = useCallback(() => {
    if (!active) return
    onComplete?.(presentationId)
  }, [active, onComplete, presentationId])

  useEffect(() => {
    if (phase !== "hold") return undefined
    const timer = window.setTimeout(() => setPhase("fade"), INGAME_TRIBUNAL_EXPULSION_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== "fade") return undefined
    const frame = requestAnimationFrame(() => setFadeOpacity(1))
    const timer = window.setTimeout(() => setPhase("message"), INGAME_TRIBUNAL_EXPULSION_FADE_MS)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [phase])

  useEffect(() => {
    if (phase !== "message") return undefined
    const timer = window.setTimeout(finish, INGAME_TRIBUNAL_EXPULSION_MESSAGE_AUTO_MS)
    return () => window.clearTimeout(timer)
  }, [phase, finish])

  const handleVideoEnded = () => {
    const video = videoRef.current
    if (video) {
      video.pause()
    }
    setPhase("hold")
  }

  const handleVideoError = () => {
    setPhase("message")
  }

  if (!active) return null

  return (
    <div
      className={INGAME_TRIBUNAL_EXPULSION_BACKDROP_CLASS}
      data-ingame-tribunal-expulsion={presentationId}
      onClick={phase === "message" ? finish : undefined}
      role="presentation"
    >
      {phase !== "message" ? (
        <div className={INGAME_TRIBUNAL_EXPULSION_VIDEO_WRAP_CLASS}>
          <video
            ref={videoRef}
            key={presentationId}
            className={INGAME_TRIBUNAL_EXPULSION_VIDEO_CLASS}
            src={INGAME_TRIBUNAL_EXPULSION_VIDEO_URL}
            playsInline
            muted
            preload="auto"
            onEnded={handleVideoEnded}
            onError={handleVideoError}
          />
          <div
            className={INGAME_TRIBUNAL_EXPULSION_FADE_LAYER_CLASS}
            style={{
              opacity: fadeOpacity,
              transitionDuration: `${INGAME_TRIBUNAL_EXPULSION_FADE_MS}ms`,
            }}
            aria-hidden="true"
          />
        </div>
      ) : (
        <p className={INGAME_TRIBUNAL_EXPULSION_MESSAGE_CLASS}>{message}</p>
      )}
    </div>
  )
}
