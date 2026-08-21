// 파일 역할: InGameKillRevealOverlay.js - 밤 사망 공개 연출(kill reveal) 화면입니다.
import { createElement, useEffect, useRef, useState } from "react"
import {
  INGAME_KILL_ANIMATION_VIDEO_URL,
  INGAME_KILL_REVEAL_BACKDROP_CLASS,
  INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS,
  INGAME_KILL_REVEAL_MESSAGE_CLASS,
  INGAME_KILL_REVEAL_PANEL_WRAP_CLASS,
  INGAME_KILL_REVEAL_RETRY_LABEL,
  INGAME_KILL_REVEAL_SKIP_BUTTON_CLASS,
  INGAME_KILL_REVEAL_SKIP_LABEL,
  INGAME_KILL_REVEAL_VIDEO_CLASS,
} from "../../constants/killReveal/ingameKillReveal.js"

/**
 * 밤 사망 공개 연출 — 전체 화면 검정 배경 위에 실제 <video>를 재생하는 오버레이.
 *
 * JSX가 아니라 createElement로 쓰인 이유는 InGameParchmentPanelBase.js 주석과 같다 — 이
 * 저장소의 프런트엔드 테스트는 변환기 없이 node --test로 곧장 돌아가므로(.jsx는 파싱할 수
 * 없다), 실제 프로덕션 DOM(그리고 실제 <video> 재생 상호작용)을 테스트가 그대로 import해
 * 검증할 수 있어야 한다.
 *
 * 표시 전용이다: 어떤 소켓 emit도, canonical store 변경도 하지 않는다. 완료(consume)는 오직
 * 아래 세 경로로만 호출부(onConsume)에 알린다 — 어느 경로든 로컬 상태 전이일 뿐이다:
 *
 *   1. 영상이 실제로 끝남(ended) — 정상 완료.
 *   2. 재생 자체가 막힘(media error) — "건너뛰기"로 명시적 계속.
 *   3. 워치독 시간(INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS)이 지나도 재생이 안 끝남 —
 *      "건너뛰기"로 명시적 계속. 절대 자동으로(조용히) 다음으로 넘어가지 않는다.
 *
 * play() 호출 자체가 reject되면(자동재생 정책 등) 오버레이는 그대로 떠 있고 "다시 재생"만
 * 노출한다 — 이 경우는 consume하지 않는다(사용자가 다시 시도해야 한다).
 *
 * loadedmetadata/canplay/canplaythrough 같은 로딩 이벤트로는 절대 완료 처리하지 않는다 —
 * 이 컴포넌트는 그런 리스너를 아예 달지 않는다.
 *
 * revealId가 바뀔 때마다(새 사망 연출로 넘어갈 때마다) 같은 <video> 엘리먼트를 재사용하며
 * currentTime을 0으로 되돌리고 play()를 다시 명시적으로 호출한다. 이전 revealId에서 걸어둔
 * play() reject 콜백·워치독 타이머는 cleanup에서 취소 플래그를 세워, 뒤늦게 도착해도 새
 * revealId의 상태를 건드리지 못한다(stale-callback 보호).
 */
export default function InGameKillRevealOverlay({ open, revealId, message, onConsume }) {
  const videoRef = useRef(null)
  const [status, setStatus] = useState("playing")

  // "다시 재생" 클릭이 만든 play() 프라미스는 useEffect 밖에서 만들어져 cancelled 플래그의
  // 보호를 받지 못한다 — reject가 도착하는 사이 revealId가 이미 다음 연출로 넘어갔다면
  // 이 ref로 그 사실을 확인해 새 연출의 status를 대신 건드리지 않는다.
  const revealIdRef = useRef(revealId)
  useEffect(() => {
    revealIdRef.current = revealId
  })

  const active = Boolean(open) && revealId !== null

  useEffect(() => {
    if (!active) return undefined
    let cancelled = false
    setStatus("playing")

    const video = videoRef.current
    if (video) {
      try {
        video.pause()
        video.currentTime = 0
      } catch {
        // 아직 메타데이터가 없는 브라우저는 currentTime 대입이 던질 수 있다 — 재생 시도는 계속한다.
      }
      const playResult = video.play()
      if (playResult && typeof playResult.then === "function") {
        playResult.catch(() => {
          if (!cancelled) setStatus("retry")
        })
      }
    }

    const watchdog = setTimeout(() => {
      if (!cancelled) setStatus((current) => (current === "playing" ? "watchdog" : current))
    }, INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS)

    return () => {
      cancelled = true
      clearTimeout(watchdog)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, revealId])

  if (!active) return null

  const handleEnded = () => onConsume(revealId)
  const handleError = () => setStatus("error")
  const handleRetry = () => {
    const targetRevealId = revealId
    setStatus("playing")
    const video = videoRef.current
    if (!video) return
    const playResult = video.play()
    if (playResult && typeof playResult.then === "function") {
      playResult.catch(() => {
        if (revealIdRef.current === targetRevealId) setStatus("retry")
      })
    }
  }
  const handleContinue = () => onConsume(revealId)

  return createElement(
    "div",
    { className: INGAME_KILL_REVEAL_BACKDROP_CLASS, "data-ingame-kill-reveal": revealId },
    createElement(
      "div",
      { className: INGAME_KILL_REVEAL_PANEL_WRAP_CLASS },
      createElement("video", {
        ref: videoRef,
        className: INGAME_KILL_REVEAL_VIDEO_CLASS,
        src: INGAME_KILL_ANIMATION_VIDEO_URL,
        muted: true,
        playsInline: true,
        preload: "auto",
        onEnded: handleEnded,
        onError: handleError,
      }),
      message ? createElement("p", { className: INGAME_KILL_REVEAL_MESSAGE_CLASS }, message) : null,
      status === "retry"
        ? createElement(
            "button",
            { type: "button", className: INGAME_KILL_REVEAL_SKIP_BUTTON_CLASS, onClick: handleRetry },
            INGAME_KILL_REVEAL_RETRY_LABEL,
          )
        : null,
      status === "watchdog" || status === "error"
        ? createElement(
            "button",
            { type: "button", className: INGAME_KILL_REVEAL_SKIP_BUTTON_CLASS, onClick: handleContinue },
            INGAME_KILL_REVEAL_SKIP_LABEL,
          )
        : null,
    ),
  )
}
