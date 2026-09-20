import { useCallback, useEffect, useRef, useState } from "react"
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
 * play() 거부가 브라우저 자동재생 정책 때문인가(사용자 동작 — 다시 재생 버튼 — 으로 다시 풀릴
 * 수 있는 **유일한** 실패 종류다). 스펙·주요 브라우저 모두 이 경우를 DOMException
 * "NotAllowedError"로만 표시한다. 자산 로드 실패·디코드 오류 등 그 밖의 모든 거부 사유는
 * 사용자가 다시 눌러도 똑같이 실패하므로 재시도로 묶지 않고 ERROR로 바로 보고한다.
 */
function isAutoplayBlockedRejection(err) {
  return err !== null && typeof err === "object" && err.name === "NotAllowedError"
}

/**
 * KILL 사건 전용 — 기존 사망 연출과 같은 kill-animation.mp4를 재생한다(AC-05).
 *
 * 기존 InGameKillRevealOverlay는 종료·오류·건너뛰기를 모두 onConsume 하나로 알려서 보고
 * 결과를 구분할 수 없다 — 그래서 재사용하지 않고, 같은 자산으로 종료 경로를 finish(outcome)로
 * 구분해 알린다.
 *
 *   - ended(정상 종료)                        → COMPLETED
 *   - video의 error 이벤트(재생 자체 실패)      → ERROR(한 번만 보고하고 다음 사건으로 넘어간다)
 *   - play() 거부 · 자동재생 정책(NotAllowedError) → 재시도 화면(아직 보고하지 않는다)
 *   - play() 거부 · 그 밖의 사유(자산 로드 실패 등) → ERROR(재시도로 풀리지 않는 실패라 바로 보고)
 *   - 사용자가 건너뛰기를 누름(재시도 화면·워치독 화면 어느 쪽에서든) → SKIPPED
 *
 * ERROR·SKIPPED·COMPLETED 중 무엇이든 사용자의 동작이나 브라우저 이벤트 하나당 정확히 한 번만
 * onFinish를 부른다 — 조용히 다음으로 넘어가지 않는다.
 */
function InGameNightSuccessKillVideo({ eventId, onFinish }) {
  const videoRef = useRef(null)
  const [status, setStatus] = useState("playing")
  /**
   * F-27b(AC-03/AC-08): **표시 수명 + 재생 시도 세대.**
   *
   * eventId 하나로는 늦은 응답을 가를 수 없다 — 재접속하면 같은 eventId가 복원되므로, 옛
   * 시도의 늦은 거부가 "같은 사건이니 내 것"이라며 새 표시를 ERROR로 끝내 버린다. 그래서
   * 이 표시 인스턴스(수명 객체의 **참조**)와 그 안의 시도 번호를 함께 본다. cleanup·다음
   * 사건·새 연결·사용자 재시도 중 무엇이든 둘 중 하나를 바꾸므로, 그 이전의 응답은 전부
   * 자기 자리를 잃는다.
   */
  const attemptRef = useRef(null)

  /**
   * 한 번의 재생 시도. **동기 예외와 비동기 거부를 같은 한 곳에서 분류한다** — 예전에는
   * play()가 그 자리에서 던지면(일부 브라우저·대역) 아무도 보고하지 않아 연출이 워치독
   * 상한까지 멈춰 있었다. 자동재생 정책 거부만 재시도 화면이고, 나머지는 전부 ERROR다.
   */
  const runPlayback = useCallback((lifetime) => {
    const generation = lifetime.generation + 1
    lifetime.generation = generation
    const isCurrentAttempt = () =>
      attemptRef.current === lifetime && lifetime.alive && lifetime.generation === generation

    const video = videoRef.current
    if (!video) return

    const reportFailure = (err) => {
      if (!isCurrentAttempt()) return
      if (isAutoplayBlockedRejection(err)) {
        setStatus("retry")
        return
      }
      setStatus("error")
      onFinish("ERROR")
    }

    let playResult
    try {
      playResult = video.play?.()
    } catch (err) {
      reportFailure(err)
      return
    }
    if (playResult && typeof playResult.then === "function") playResult.catch(reportFailure)
  }, [onFinish])

  useEffect(() => {
    const lifetime = { alive: true, generation: 0 }
    attemptRef.current = lifetime
    setStatus("playing")

    const video = videoRef.current
    if (video) {
      try {
        video.pause()
        video.currentTime = 0
      } catch {
        // 아직 메타데이터가 없는 브라우저는 currentTime 대입이 던질 수 있다 — 재생 시도는 계속한다.
      }
    }
    runPlayback(lifetime)

    const watchdog = setTimeout(() => {
      if (!lifetime.alive || attemptRef.current !== lifetime) return
      setStatus((prev) => (prev === "playing" ? "watchdog" : prev))
    }, INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS)

    return () => {
      // 이 표시의 수명이 끝났다. 매체는 멈추고 예약·재시도 상태는 버리되, **완료 보고는
      // 만들지 않는다** — StrictMode의 setup→cleanup→setup은 사용자가 본 것이 아니다.
      lifetime.alive = false
      clearTimeout(watchdog)
      try {
        videoRef.current?.pause?.()
      } catch {
        // 이미 분리된 요소의 pause는 무시한다(정리 경로가 던져서는 안 된다).
      }
    }
  }, [eventId, runPlayback])

  const handleEnded = () => onFinish("COMPLETED")
  const handleError = () => {
    setStatus("error")
    onFinish("ERROR")
  }
  const handleSkip = () => onFinish("SKIPPED")
  const handleRetry = () => {
    const lifetime = attemptRef.current
    if (!lifetime || !lifetime.alive) return
    setStatus("playing")
    runPlayback(lifetime)
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
          <>
            <button type="button" className={INGAME_KILL_REVEAL_SKIP_BUTTON_CLASS} onClick={handleRetry}>
              {INGAME_KILL_REVEAL_RETRY_LABEL}
            </button>
            {/* AC-03(CODEX 반려 수정): 자동재생 거부는 재시도만으로는 못 벗어날 수 있다(권한이
                계속 거부되는 환경) — 재시도 화면에서도 건너뛰기로 SKIPPED를 보고할 수 있어야
                연출이 막히지 않는다. */}
            <button type="button" className={INGAME_KILL_REVEAL_SKIP_BUTTON_CLASS} onClick={handleSkip}>
              {INGAME_KILL_REVEAL_SKIP_LABEL}
            </button>
          </>
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
