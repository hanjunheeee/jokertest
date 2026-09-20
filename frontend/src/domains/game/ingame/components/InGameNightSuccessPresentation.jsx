import { useCallback, useEffect, useRef, useState } from "react"
import InGameParchmentModalBase from "./parchment/InGameParchmentModalBase.js"
import InGameParchmentConfirmButton from "./parchment/InGameParchmentConfirmButton.js"
import { useInGameNightSuccessPresentation } from "../hooks/useInGameNightSuccessPresentation.js"
import { resolveNightSuccessVideo } from "../utils/resolveNightSuccessVideo.js"
import { getSfxMix, subscribeSfxMix } from "../../../../shared/hooks/useSfxRuntime.js"
import { INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS } from "../constants/nightPrivateResult/ingameNightPrivateResult.js"
import {
  INGAME_KILL_REVEAL_BACKDROP_CLASS,
  INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS,
  INGAME_KILL_REVEAL_PANEL_WRAP_CLASS,
  INGAME_KILL_REVEAL_RETRY_LABEL,
  INGAME_KILL_REVEAL_SKIP_BUTTON_CLASS,
  INGAME_KILL_REVEAL_SKIP_LABEL,
} from "../constants/killReveal/ingameKillReveal.js"

/**
 * F-27c(알파 처리): 공용 INGAME_KILL_REVEAL_VIDEO_CLASS에는 bg-black이 있다 — 그 상수는
 * 바꾸지 않는다(공개 사망 연출은 여전히 검은 배경을 깐다). 역할 영상 5개는 VP9 알파 웹 변환본이라
 * 같은 크기·테두리·그림자 관례를 재사용하되 배경색만 뺀다(검은 배경을 깔면 알파가 무의미하다).
 */
const INGAME_NIGHT_SUCCESS_ROLE_VIDEO_CLASS =
  "max-h-[62svh] w-[min(48rem,92vw)] rounded border border-[#6b4321]/60 object-contain shadow-[0_20px_60px_rgba(0,0,0,0.6)]"

/** night_action_success type → 전용 영상이 없는 동안 임시 연출을 보여줄 수 있는 종류. */
const NIGHT_SUCCESS_PENDING_SUPPORTED_TYPES = new Set(["HEAL", "INVESTIGATE", "CONFIRM"])

/**
 * F-27c(AC-01): 임시 연출 문구에는 역할명을 넣지 않는다 — 이 화면은 TARGET 관점에도 뜰 수
 * 있고(예: INVESTIGATE-TARGET·CONFIRM-TARGET), 대상자에게 조사자·확인자 역할을 알려주면
 * 안 되기 때문이다. type은 "지원하는 임시 연출인가"만 가리는 데 쓰고 문구에는 나타나지 않는다.
 */
function buildPendingAssetLabel(type) {
  if (!NIGHT_SUCCESS_PENDING_SUPPORTED_TYPES.has(type)) return null
  return "연출 자료 대기 중입니다."
}

function buildFinalStatusLabel(alive) {
  return alive ? "최종 결과, 생존했습니다." : "최종 결과, 사망했습니다."
}

/**
 * play() 거부가 브라우저 자동재생 정책 때문인가(무음 재시도·사용자 동작으로 풀릴 수 있는
 * **유일한** 실패 종류다). 스펙·주요 브라우저 모두 이 경우를 DOMException "NotAllowedError"로만
 * 표시한다. 자산 로드 실패·디코드 오류 등 그 밖의 모든 거부 사유는 재시도로 묶지 않고 ERROR로
 * 바로 보고한다.
 */
function isAutoplayBlockedRejection(err) {
  return err !== null && typeof err === "object" && err.name === "NotAllowedError"
}

/** 한 재생 시도가 걸어 둔 상한 예약을 버린다(응답이 온 순간·수명이 끝난 순간 모두 여기로 온다). */
function cancelPlaybackWatchdog(lifetime) {
  if (!lifetime || lifetime.watchdogId === null || lifetime.watchdogId === undefined) return
  clearTimeout(lifetime.watchdogId)
  lifetime.watchdogId = null
}

/**
 * F-27c(AC-03): 공통 mix(Master×SFX·mute)를 video 요소에 적용한다. `forceMuted`가 true면
 * mix.muted 값과 무관하게 음소거를 강제한다(무음 latch — 자동재생이 무음으로만 허용된 뒤에는
 * 설정 변경도 이 사건을 다시 유음으로 만들지 않는다, AC-05).
 *
 * volume·muted 대입 자체가 던지는 드문 매체 구현에서는 muted=true만이라도 관철시킨다 —
 * 그마저 던지면 이 사건에는 소리도 무음도 보장할 수 없다는 뜻이라 호출부가 ERROR로 끝낸다.
 */
function applyMixToVideo(video, mix, forceMuted) {
  if (!video) return true
  try {
    video.muted = true
    video.volume = mix.gain
    video.muted = forceMuted ? true : mix.muted
    return true
  } catch {
    try {
      video.muted = true
      return true
    } catch {
      return false
    }
  }
}

/**
 * F-27c: 밤 성공 사건의 역할 공용 영상 재생 — 5개 선택표(resolveNightSuccessVideo) 중
 * 하나를 src로 받아 재생한다(AC-01). 기존 InGameKillRevealOverlay는 종료·오류·건너뛰기를
 * 모두 onConsume 하나로 알려서 보고 결과를 구분할 수 없다 — 그래서 재사용하지 않고, 종료
 * 경로를 finish(outcome)로 구분해 알린다.
 *
 *   - ended(정상 종료)                        → COMPLETED
 *   - video의 error 이벤트(재생 자체 실패)      → ERROR(한 번만 보고하고 다음 사건으로 넘어간다)
 *   - play() 거부 · 자동재생 정책(NotAllowedError) →
 *       처음 걸린 시도가 유음(mix.muted=false)이었으면 무음 latch를 한 번 세우고 조용히
 *       재시도한다(AC-05). 그 재시도까지 거부되거나,애초에 무음 시도였다면 재시도 화면으로
 *       간다(아직 보고하지 않는다).
 *   - play() 거부 · 그 밖의 사유(자산 로드 실패 등) → ERROR(재시도로 풀리지 않는 실패라 바로 보고)
 *   - mix 적용조차 실패(volume·muted 대입이 던짐)   → ERROR
 *   - 사용자가 건너뛰기를 누름(재시도 화면·워치독 화면 어느 쪽에서든) → SKIPPED
 *
 * ERROR·SKIPPED·COMPLETED 중 무엇이든 사용자의 동작이나 브라우저 이벤트 하나당 정확히 한 번만
 * onFinish를 부른다 — 조용히 다음으로 넘어가지 않는다.
 */
function InGameNightSuccessKillVideo({ eventId, src, onFinish }) {
  const videoRef = useRef(null)
  const [status, setStatus] = useState("loading")
  /**
   * F-27c(AC-03/AC-05): **표시 수명 + 재생 시도 세대 + 무음 latch + 종료 가드.**
   *
   * eventId 하나로는 늦은 응답을 가를 수 없다 — 재접속하면 같은 eventId가 복원되므로, 옛
   * 시도의 늦은 거부가 "같은 사건이니 내 것"이라며 새 표시를 ERROR로 끝내 버린다. 그래서
   * 이 표시 인스턴스(수명 객체의 **참조**)와 그 안의 시도 번호를 함께 본다. cleanup·다음
   * 사건·새 연결·사용자 재시도 중 무엇이든 둘 중 하나를 바꾸므로, 그 이전의 응답은 전부
   * 자기 자리를 잃는다. silentLatch는 이 사건의 수명 동안만 유지된다 — 다음 사건은 latch 없이
   * 다시 시작한다. settled는 이 사건이 이미 한 번 끝났는지를 표시한다(아래 settleOnce 참고).
   */
  const attemptRef = useRef(null)

  /**
   * F-27c(AC-05, CODEX 반려 수정): **settleWith·reportFailure·watchdog가 공유하는 단일 종료
   * 가드.** 예전에는 세 경로가 각자 onFinish를 직접 불러서, ended가 COMPLETED를 보고한 뒤에도
   * 뒤이은 error 이벤트나 뒤늦은 watchdog·reportFailure가 같은 사건을 또 보고할 수 있었다.
   * 이제는 이 함수 하나만 onFinish를 부르고, 그 사건(lifetime)당 한 번 불리고 나면 이후의 모든
   * settleOnce 호출은 조용히 무시한다 — **먼저 일어난 종료 하나만** 보고된다.
   */
  const settleOnce = useCallback((lifetime, outcome, nextStatus) => {
    if (!lifetime || lifetime.settled) return
    lifetime.settled = true
    cancelPlaybackWatchdog(lifetime)
    if (nextStatus) setStatus(nextStatus)
    onFinish(outcome)
  }, [onFinish])

  const runPlayback = useCallback((lifetime, { retry = false } = {}) => {
    // 이미 끝난 사건은 새 시도를 시작하지 않는다(예: StrictMode 이중 마운트의 첫 setup이
    // 취소되지 않은 채로 늦게 굴러 들어오는 경우에 대한 방어선).
    if (lifetime.settled) return

    const generation = lifetime.generation + 1
    lifetime.generation = generation
    const isCurrentAttempt = () =>
      attemptRef.current === lifetime && lifetime.alive && lifetime.generation === generation

    cancelPlaybackWatchdog(lifetime)
    lifetime.watchdogId = setTimeout(() => {
      if (!isCurrentAttempt()) return
      lifetime.watchdogId = null
      if (retry) {
        settleOnce(lifetime, "ERROR", "error")
        return
      }
      setStatus((prev) => (prev === "loading" || prev === "playing" ? "watchdog" : prev))
    }, INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS)

    const video = videoRef.current
    if (!video) return

    const mix = getSfxMix()
    const forceMuted = lifetime.silentLatch || mix.muted
    if (!applyMixToVideo(video, mix, forceMuted)) {
      settleOnce(lifetime, "ERROR", "error")
      return
    }
    const attemptWasMuted = forceMuted

    const reportFailure = (err) => {
      if (!isCurrentAttempt()) return
      // 응답이 왔다 — 이 시도의 상한은 여기서 끝난다(재시도 화면에는 건너뛰기가 함께 있다).
      cancelPlaybackWatchdog(lifetime)
      if (isAutoplayBlockedRejection(err)) {
        if (!attemptWasMuted && !lifetime.silentLatch) {
          // AC-05: 유음 시도가 자동재생 정책으로 거부됐다 — 무음으로 한 번만 조용히 재시도한다.
          lifetime.silentLatch = true
          runPlayback(lifetime)
          return
        }
        setStatus("retry")
        return
      }
      settleOnce(lifetime, "ERROR", "error")
    }

    let playResult
    try {
      playResult = video.play?.()
    } catch (err) {
      reportFailure(err)
      return
    }
    if (playResult && typeof playResult.then === "function") {
      playResult.then(() => {
        if (isCurrentAttempt()) setStatus((prev) => (prev === "loading" ? "playing" : prev))
      }, reportFailure)
    }
  }, [settleOnce])

  useEffect(() => {
    const lifetime = { alive: true, generation: 0, watchdogId: null, silentLatch: false, settled: false }
    attemptRef.current = lifetime
    setStatus("loading")

    const video = videoRef.current
    if (video) {
      try {
        video.pause()
        video.currentTime = 0
      } catch {
        // 아직 메타데이터가 없는 브라우저는 currentTime 대입이 던질 수 있다 — 재생 시도는 계속한다.
      }
    }

    /**
     * F-27c(AC-02, CODEX 반려 수정): 재생 시작을 **취소 가능한 예약**으로 미룬다. React
     * StrictMode의 setup→cleanup→setup은 둘 다 동기적으로 일어나므로, 첫 setup이 곧바로
     * play()를 부르면 두 번째(살아남는) setup도 각자 play()를 불러 **같은 video에 재생이
     * 두 번** 걸린다. 대신 마이크로태스크로 미뤄 두면 첫 setup의 cleanup이 그 예약을
     * 무효화하고, 실제로 살아남은 setup의 예약만 마이크로태스크 큐가 비워질 때 실행된다 —
     * 같은 사건·같은 마운트 수명에서 play()는 정확히 한 번만 불린다.
     */
    let scheduled = true
    queueMicrotask(() => {
      if (!scheduled) return
      runPlayback(lifetime)
    })

    return () => {
      // 이 표시의 수명이 끝났다. 매체는 멈추고 예약·재시도 상태는 버리되, **완료 보고는
      // 만들지 않는다** — StrictMode의 setup→cleanup→setup은 사용자가 본 것이 아니다.
      scheduled = false
      lifetime.alive = false
      cancelPlaybackWatchdog(lifetime)
      try {
        videoRef.current?.pause?.()
      } catch {
        // 이미 분리된 요소의 pause는 무시한다(정리 경로가 던져서는 안 된다).
      }
    }
  }, [eventId, src, runPlayback])

  // F-27c(AC-03): 설정 변경(Master·SFX 볼륨, 음소거)을 같은 video에 반영한다 — play()를 다시
  // 부르지 않는다. 무음 latch가 서 있는 동안에는(AC-05) 설정이 유음으로 바뀌어도 이 사건은
  // 계속 무음이다.
  useEffect(() => {
    const unsubscribe = subscribeSfxMix((mix) => {
      const lifetime = attemptRef.current
      const video = videoRef.current
      if (!video || !lifetime || !lifetime.alive) return
      const forceMuted = lifetime.silentLatch || mix.muted
      if (!applyMixToVideo(video, mix, forceMuted)) {
        settleOnce(lifetime, "ERROR", "error")
      }
    })
    return unsubscribe
  }, [settleOnce])

  const handleEnded = () => settleOnce(attemptRef.current, "COMPLETED")
  const handleError = () => settleOnce(attemptRef.current, "ERROR", "error")
  const handleSkip = () => settleOnce(attemptRef.current, "SKIPPED")
  const handleRetry = () => {
    const lifetime = attemptRef.current
    if (!lifetime || !lifetime.alive || lifetime.settled) return
    setStatus("loading")
    runPlayback(lifetime, { retry: true })
  }

  return (
    <div className={INGAME_KILL_REVEAL_BACKDROP_CLASS} data-ingame-night-success-kill="">
      <div className={INGAME_KILL_REVEAL_PANEL_WRAP_CLASS}>
        <video
          ref={videoRef}
          className={INGAME_NIGHT_SUCCESS_ROLE_VIDEO_CLASS}
          src={src}
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
            {/* AC-05: 자동재생 거부는 재시도만으로는 못 벗어날 수 있다(권한이 계속 거부되는
                환경) — 재시도 화면에서도 건너뛰기로 SKIPPED를 보고할 수 있어야 연출이 막히지
                않는다. */}
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
 * 전용 영상이 없는 사건의 임시 연출(AC-01) — 기존 파치먼트 셸(nightPrivateResult variant —
 * 이 저장소에서 참조하는 오버레이가 없던 미사용 variant를 재사용한다) 위에 "자료 대기" 문구를
 * 보여준다.
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
      wrapperProps={{ "data-ingame-night-success-pending": "" }}
    >
      <p className={INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS}>{label}</p>
      <InGameParchmentConfirmButton label="확인" onClick={() => onFinish("COMPLETED")} />
    </InGameParchmentModalBase>
  )
}

/**
 * F-27c: 밤 성공 사건(night_action_success) 큐의 표시 컴포넌트.
 *
 * 표시에 필요한 값의 출처는 **오직 useInGameNightSuccessPresentation 하나**다. 그래서 이
 * 컴포넌트는 스스로 설 수 있다 — props 없이 놓아두면 그 훅을 직접 불러 큐의 선두 사건을 읽고,
 * 재생 종료를 같은 훅의 finish로 보고한다(store·소켓을 직접 만지는 줄은 이 파일에 없다).
 *
 * 다만 InGamePage는 자기 화면의 다른 오버레이(자기 역할 공개·공개 사망 연출)와의 우선순위를
 * 합쳐 "지금 띄워도 되는가"를 정해야 하므로, **같은 훅으로 만든 값**을 props로 내려보낸다.
 * open이 실제로 넘어왔으면 그쪽이 이긴다(controlled). 그때 이 컴포넌트가 가진 자기 훅은
 * hold로 접어 둔다 — 두 벌의 표시가 동시에 열리거나, 페이지가 보류시킨 연출이 여기서 혼자
 * 열리는 일이 없어야 한다.
 *
 * F-27c(AC-01): 어느 자산을 쓸지는 assetStatus가 아니라 resolveNightSuccessVideo(current)를
 * 여기서 직접 다시 불러 정한다 — 훅의 assetStatus는 "영상이 있다/없다"는 신호일 뿐, 실제로
 * 무엇을 재생할지(어느 관점의 어느 파일)는 이 컴포넌트가 같은 사건 객체로 독립적으로 계산한다.
 *
 * 어느 쪽이든 이 컴포넌트가 직접 소켓 emit이나 store 변경을 하지 않는 것은 같다 — 선택표에
 * 있는 사건은 실제 영상을, 없는 사건은 임시 연출을 보여주고, 큐가 비면 finalStatus(있을 때만)
 * 최종 생존 화면으로 이어지며, 모든 종료는 finish(outcome) 한 콜백을 통해 훅으로만 올라간다.
 */
export default function InGameNightSuccessPresentation({
  current: currentProp,
  open: openProp,
  finish: finishProp,
  assetStatus: assetStatusProp,
  finalStatus: finalStatusProp,
  onClose: onCloseProp,
  hold = false,
} = {}) {
  const controlled = openProp !== undefined
  const owned = useInGameNightSuccessPresentation({ hold: controlled || hold })

  const current = controlled ? currentProp : owned.current
  const open = controlled ? openProp : owned.open
  const finish = controlled ? finishProp : owned.finish
  const finalStatus = controlled ? finalStatusProp : owned.finalStatus
  const onClose = controlled ? onCloseProp : owned.onClose
  // assetStatusProp/owned.assetStatus는 소비하지 않는다 — 실제 렌더 분기는 아래에서 같은
  // 사건 객체로 resolveNightSuccessVideo를 직접 계산한다(assetStatus만으로 영상 사용을
  // 허용하지 않는다).
  void assetStatusProp

  if (!open) return null

  if (current) {
    const video = resolveNightSuccessVideo(current)
    if (video) {
      return <InGameNightSuccessKillVideo eventId={current.eventId} src={video.src} onFinish={finish} />
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
