// 재판 추방 연출 창: 추방 영상 → 잠깐 멈춤 → 어두워짐 → 문구, 끝나면 알림
// 인게임 화면이 사용, 띄울 차례는 useInGameTribunalExpulsionPresentation
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

// 단계는 playing → hold → fade → message, 문구에서 시간 지나거나 누르면 끝
export default function InGameTribunalExpulsionOverlay({
  open = false,
  presentationId = null,
  message = null,
  onComplete = null,
}) {
  const videoRef = useRef(null)
  const [phase, setPhase] = useState("playing")
  const [fadeOpacity, setFadeOpacity] = useState(0)

  // 열림이어도 연출 id 없으면 안 띄움
  const active = Boolean(open) && typeof presentationId === "string" && presentationId.length > 0

  // 새 연출마다 처음부터 재생, 자동 재생 막히면 바로 멈춤 단계로
  useEffect(() => {
    // 닫히면 단계·어둡기 처음으로 되돌림
    if (!active) {
      setPhase("playing")
      setFadeOpacity(0)
      return undefined
    }

    setPhase("playing")
    setFadeOpacity(0)

    // 영상 칸 없으면(문구 단계 화면이면) 재생 건너뜀
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

  // 열려 있을 때만 끝 알림, 지금 연출 id를 같이 넘김
  const finish = useCallback(() => {
    if (!active) return
    onComplete?.(presentationId)
  }, [active, onComplete, presentationId])

  // 멈춤 단계는 잠깐 보여 준 뒤 어두워짐으로
  useEffect(() => {
    if (phase !== "hold") return undefined
    const timer = window.setTimeout(() => setPhase("fade"), HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  // 다음 프레임에 어둡게 시작, 다 어두워지면 문구로
  useEffect(() => {
    if (phase !== "fade") return undefined
    const frame = requestAnimationFrame(() => setFadeOpacity(1))
    const timer = window.setTimeout(() => setPhase("message"), FADE_MS)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [phase])

  // 문구는 정한 시간 지나면 저절로 끝
  useEffect(() => {
    if (phase !== "message") return undefined
    const timer = window.setTimeout(finish, MSG_AUTO_MS)
    return () => window.clearTimeout(timer)
  }, [phase, finish])

  // 영상 끝나면 마지막 장면에 멈춰 두고 멈춤 단계로
  const handleVideoEnded = () => {
    const video = videoRef.current
    if (video) {
      video.pause()
    }
    setPhase("hold")
  }

  // 영상이 안 열리면 바로 문구로
  const handleVideoError = () => {
    setPhase("message")
  }

  if (!active) return null

  // 문구 단계에서만 화면 눌러 바로 끝내기
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
