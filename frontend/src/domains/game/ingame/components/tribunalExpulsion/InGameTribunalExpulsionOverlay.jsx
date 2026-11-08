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
  SKIP_BTN_CLASS,
  SKIP_LABEL,
  VIDEO_CLASS,
  VIDEO_URL,
  VIDEO_WATCHDOG_MS,
  VIDEO_WRAP_CLASS,
} from "../../constants/ingameTribunalExpulsionPresentation.js"

// 열림이어도 연출 id 없으면 안 띄움, 연출 id마다 새로 그려 단계·영상을 처음부터
export default function InGameTribunalExpulsionOverlay({
  open = false,
  presentationId = null,
  message = null,
  onComplete = null,
}) {
  const active = Boolean(open) && typeof presentationId === "string" && presentationId.length > 0
  if (!active) return null
  return (
    <TribunalExpulsionPlayback
      key={presentationId}
      presentationId={presentationId}
      message={message}
      onComplete={onComplete}
    />
  )
}

// 단계는 playing → hold → fade → message, 문구에서 시간 지나거나 누르면 끝
// 연달아 와도 새로 그려지므로 영상 칸이 늘 있는 첫 단계에서 재생 시작함
function TribunalExpulsionPlayback({ presentationId, message, onComplete }) {
  const videoRef = useRef(null)
  const [phase, setPhase] = useState("playing")
  const [fadeOpacity, setFadeOpacity] = useState(0)
  const [stalled, setStalled] = useState(false)

  // 처음 그려질 때 한 번 재생, 자동 재생 막히면 바로 멈춤 단계로
  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined
    let alive = true
    let playResult
    try {
      video.currentTime = 0
      playResult = video.play?.()
    } catch (err) {
      playResult = Promise.reject(err)
    }
    Promise.resolve(playResult).catch(() => {
      if (alive) setPhase("hold")
    })
    return () => {
      alive = false
    }
  }, [])

  // 영상이 끝 알림 없이 멈추면 건너뛰기 버튼 띄움 (화면 잠김 막기)
  useEffect(() => {
    if (phase !== "playing") return undefined
    const timer = window.setTimeout(() => setStalled(true), VIDEO_WATCHDOG_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  // 끝 알림, 지금 연출 id를 같이 넘김
  const finish = useCallback(() => {
    onComplete?.(presentationId)
  }, [onComplete, presentationId])

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
    videoRef.current?.pause?.()
    setPhase("hold")
  }

  // 영상이 안 열리거나 건너뛰면 바로 문구로
  const goToMessage = () => {
    videoRef.current?.pause?.()
    setPhase("message")
  }

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
            className={VIDEO_CLASS}
            src={VIDEO_URL}
            playsInline
            muted
            preload="auto"
            onEnded={handleVideoEnded}
            onError={goToMessage}
          />
          <div
            className={FADE_LAYER_CLASS}
            style={{
              opacity: fadeOpacity,
              transitionDuration: `${FADE_MS}ms`,
            }}
            aria-hidden="true"
          />
          {stalled && phase === "playing" ? (
            <button type="button" className={SKIP_BTN_CLASS} onClick={goToMessage}>
              {SKIP_LABEL}
            </button>
          ) : null}
        </div>
      ) : (
        <p className={MSG_CLASS}>{message}</p>
      )}
    </div>
  )
}
