import { useCallback, useEffect, useRef, useState } from "react"
import {
  BACKDROP_CLASS,
  FADE_LAYER_CLASS,
  FADE_MS,
  HOLD_MS,
  MSG_AUTO_MS,
  MSG_CLASS,
  VIDEO_CLASS,
  VIDEO_URL,
  VIDEO_WRAP_CLASS,
} from "../../constants/ingameTribunalExpulsionPresentation.js"

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
    const timer = window.setTimeout(() => setPhase("fade"), HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== "fade") return undefined
    const frame = requestAnimationFrame(() => setFadeOpacity(1))
    const timer = window.setTimeout(() => setPhase("message"), FADE_MS)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [phase])

  useEffect(() => {
    if (phase !== "message") return undefined
    const timer = window.setTimeout(finish, MSG_AUTO_MS)
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
      className={BACKDROP_CLASS}
      data-ingame-tribunal-expulsion={presentationId}
      onClick={phase === "message" ? finish : undefined}
      role="presentation"
    >
      {phase !== "message" ? (
        <div className={VIDEO_WRAP_CLASS}>
          <video
            ref={videoRef}
            key={presentationId}
            className={VIDEO_CLASS}
            src={VIDEO_URL}
            playsInline
            muted
            preload="auto"
            onEnded={handleVideoEnded}
            onError={handleVideoError}
          />
          <div
            className={FADE_LAYER_CLASS}
            style={{
              opacity: fadeOpacity,
              transitionDuration: `${FADE_MS}ms`,
            }}
            aria-hidden="true"
          />
        </div>
      ) : (
        <p className={MSG_CLASS}>{message}</p>
      )}
    </div>
  )
}
