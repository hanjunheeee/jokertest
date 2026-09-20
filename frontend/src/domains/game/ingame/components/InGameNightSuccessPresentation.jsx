import { useEffect, useRef, useState } from "react"
import InGameParchmentModalBase from "./parchment/InGameParchmentModalBase.js"
import InGameParchmentConfirmButton from "./parchment/InGameParchmentConfirmButton.js"
import { INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS } from "../constants/nightPrivateResult/ingameNightPrivateResult.js"
import {
  INGAME_KILL_ANIMATION_VIDEO_URL,
  INGAME_KILL_REVEAL_BACKDROP_CLASS,
  INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS,
  INGAME_KILL_REVEAL_PANEL_WRAP_CLASS,
  INGAME_KILL_REVEAL_RETRY_LABEL,
  INGAME_KILL_REVEAL_SKIP_BUTTON_CLASS,
  INGAME_KILL_REVEAL_SKIP_LABEL,
  INGAME_KILL_REVEAL_VIDEO_CLASS,
} from "../constants/killReveal/ingameKillReveal.js"

/** night_action_success type → 아직 전용 자산이 없는 세 역할의 표시 이름. */
const NIGHT_SUCCESS_PENDING_ROLE_LABEL = Object.freeze({
  HEAL: "의사",
  INVESTIGATE: "경비원",
  CONFIRM: "마녀사냥꾼",
})

function buildPendingAssetLabel(type) {
  const role = NIGHT_SUCCESS_PENDING_ROLE_LABEL[type] ?? null
  if (!role) return null
  return `${role}의 연출 자료 대기 중입니다.`
}

function buildFinalStatusLabel(alive) {
  return alive ? "최종 결과, 생존했습니다." : "최종 결과, 사망했습니다."
}

/**
 * KILL 사건 전용 — 기존 사망 연출과 같은 kill-animation.mp4를 재생한다(AC-05).
 *
 * 기존 InGameKillRevealOverlay는 종료·오류·건너뛰기를 모두 onConsume 하나로 알려서 보고
 * 결과를 구분할 수 없다 — 그래서 재사용하지 않고, 같은 자산·같은 3단계 실패 대응(재시도/
 * 건너뛰기/워치독)을 이 컴포넌트가 다시 구현하되 세 종료 경로를 finish(outcome)로 구분해
 * 알린다.
 *
 *   - ended(정상 종료)            → COMPLETED
 *   - video의 error(재생 자체 실패) → ERROR
 *   - 사용자가 건너뛰기를 누름      → SKIPPED(자동재생 거부 뒤 재시도 화면, 워치독 뒤 정지 화면
 *     양쪽 모두 사용자가 명시적으로 눌러야만 보고된다 — 조용히 다음으로 넘어가지 않는다)
 */
function InGameNightSuccessKillVideo({ eventId, onFinish }) {
  const videoRef = useRef(null)
  const [status, setStatus] = useState("playing")
  const eventIdRef = useRef(eventId)
  useEffect(() => {
    eventIdRef.current = eventId
  })

  useEffect(() => {
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
      const playResult = video.play?.()
      if (playResult && typeof playResult.then === "function") {
        playResult.catch(() => {
          if (!cancelled) setStatus("retry")
        })
      }
    }

    const watchdog = setTimeout(() => {
      if (!cancelled) setStatus((prev) => (prev === "playing" ? "watchdog" : prev))
    }, INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS)

    return () => {
      cancelled = true
      clearTimeout(watchdog)
    }
  }, [eventId])

  const handleEnded = () => onFinish("COMPLETED")
  const handleError = () => {
    setStatus("error")
    onFinish("ERROR")
  }
  const handleSkip = () => onFinish("SKIPPED")
  const handleRetry = () => {
    const targetEventId = eventId
    setStatus("playing")
    const video = videoRef.current
    if (!video) return
    const playResult = video.play?.()
    if (playResult && typeof playResult.then === "function") {
      playResult.catch(() => {
        if (eventIdRef.current === targetEventId) setStatus("retry")
      })
    }
  }

  return (
    <div className={INGAME_KILL_REVEAL_BACKDROP_CLASS} data-ingame-night-success-kill={eventId}>
      <div className={INGAME_KILL_REVEAL_PANEL_WRAP_CLASS}>
        <video
          ref={videoRef}
          className={INGAME_KILL_REVEAL_VIDEO_CLASS}
          src={INGAME_KILL_ANIMATION_VIDEO_URL}
          muted
          playsInline
          preload="auto"
          onEnded={handleEnded}
          onError={handleError}
        />
        {status === "retry" ? (
          <button type="button" className={INGAME_KILL_REVEAL_SKIP_BUTTON_CLASS} onClick={handleRetry}>
            {INGAME_KILL_REVEAL_RETRY_LABEL}
          </button>
        ) : null}
        {status === "watchdog" ? (
          <button type="button" className={INGAME_KILL_REVEAL_SKIP_BUTTON_CLASS} onClick={handleSkip}>
            {INGAME_KILL_REVEAL_SKIP_LABEL}
          </button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * HEAL·INVESTIGATE·CONFIRM 전용 임시 연출(AC-04) — 전용 영상이 없는 동안 기존 파치먼트 셸
 * (nightPrivateResult variant — 이 저장소에서 참조하는 오버레이가 없던 미사용 variant를
 * 재사용한다) 위에 "자료 대기" 문구를 보여준다.
 *
 * 확인 버튼은 COMPLETED, backdrop 클릭·Escape는 SKIPPED로 각각 다르게 끝낸다 — 그래서
 * showConfirm을 끄고 확인 버튼을 직접 그린다(InGameParchmentModalBase의 내장 확인 버튼은
 * backdrop/Escape와 같은 onDismiss 하나를 공유해 둘을 구분하지 못한다).
 */
function InGameNightSuccessPendingAsset({ type, eventId, onFinish }) {
  const label = buildPendingAssetLabel(type)
  if (label === null) return null

  return (
    <InGameParchmentModalBase
      variantKey="nightPrivateResult"
      onDismiss={() => onFinish("SKIPPED")}
      showConfirm={false}
      focusKey={eventId}
      wrapperProps={{ "data-ingame-night-success-pending": type }}
    >
      <p className={INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS}>{label}</p>
      <InGameParchmentConfirmButton label="확인" onClick={() => onFinish("COMPLETED")} />
    </InGameParchmentModalBase>
  )
}

/**
 * F-27b: 밤 성공 사건(night_action_success) 큐의 표시 컴포넌트.
 *
 * useInGameNightSuccessPresentation이 넘기는 현재 사건 하나만 그린다 — KILL은 실제 영상을,
 * 나머지 세 종류는 임시 연출을 보여주고, 큐가 비면 finalStatus(있을 때만) 최종 생존 화면으로
 * 이어진다. 어떤 경로도 이 컴포넌트가 직접 소켓 emit이나 store 변경을 하지 않는다 — 모든
 * 종료는 finish(outcome) 한 콜백을 통해 훅으로만 올라간다.
 */
export default function InGameNightSuccessPresentation({
  current, open, finish, assetStatus, finalStatus, onClose,
}) {
  if (!open) return null

  if (current) {
    if (assetStatus === "VERIFIED") {
      return <InGameNightSuccessKillVideo eventId={current.eventId} onFinish={finish} />
    }
    return (
      <InGameNightSuccessPendingAsset type={current.type} eventId={current.eventId} onFinish={finish} />
    )
  }

  if (finalStatus) {
    return (
      <InGameParchmentModalBase
        variantKey="nightPrivateResult"
        onDismiss={onClose}
        confirmLabel="확인"
        wrapperProps={{
          "data-ingame-night-success-final": finalStatus.alive ? "ALIVE" : "DEAD",
        }}
      >
        <p className={INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS}>
          {buildFinalStatusLabel(finalStatus.alive)}
        </p>
      </InGameParchmentModalBase>
    )
  }

  return null
}
