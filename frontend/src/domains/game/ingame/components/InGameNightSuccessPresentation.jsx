import { useCallback, useEffect, useRef, useState } from "react"
import InGameParchmentModalBase from "./parchment/InGameParchmentModalBase.js"
import InGameParchmentConfirmButton from "./parchment/InGameParchmentConfirmButton.js"
import { useInGameNightSuccessPresentation } from "../hooks/useInGameNightSuccessPresentation.js"
import { resolveNightSuccessVideo } from "../utils/resolveNightSuccessVideo.js"
import { composeStackedAlpha } from "../utils/composeStackedAlpha.js"
import { getSfxMix, subscribeSfxMix } from "../../../../shared/hooks/useSfxRuntime.js"
import { INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS } from "../constants/nightPrivateResult/ingameNightPrivateResult.js"
import {
  INGAME_KILL_REVEAL_BACKDROP_CLASS,
  INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS,
  INGAME_KILL_REVEAL_PANEL_WRAP_CLASS,
  INGAME_KILL_REVEAL_RETRY_SURFACE_ATTR,
  INGAME_KILL_REVEAL_SKIP_BUTTON_CLASS,
  INGAME_KILL_REVEAL_SKIP_LABEL,
} from "../constants/killReveal/ingameKillReveal.js"

const INGAME_NIGHT_SUCCESS_ROLE_VIDEO_CLASS =
  "max-h-[62svh] w-[min(48rem,92vw)] rounded border border-[#6b4321]/60 object-contain shadow-[0_20px_60px_rgba(0,0,0,0.6)]"

const INGAME_NIGHT_SUCCESS_HIDDEN_VIDEO_STYLE = Object.freeze({ display: "none" })

const NIGHT_SUCCESS_PENDING_SUPPORTED_TYPES = new Set(["HEAL", "INVESTIGATE", "CONFIRM"])

function buildPendingAssetLabel(type) {
  if (!NIGHT_SUCCESS_PENDING_SUPPORTED_TYPES.has(type)) return null
  return "연출 자료 대기 중입니다."
}

function buildFinalStatusLabel(alive) {
  return alive ? "최종 결과, 생존했습니다." : "최종 결과, 사망했습니다."
}

function isAutoplayBlockedRejection(err) {
  return err !== null && typeof err === "object" && err.name === "NotAllowedError"
}

function cancelPlaybackWatchdog(lifetime) {
  if (!lifetime || lifetime.watchdogId === null || lifetime.watchdogId === undefined) return
  clearTimeout(lifetime.watchdogId)
  lifetime.watchdogId = null
}

function cancelFrameLoop(lifetime, video) {
  if (!lifetime || lifetime.frameHandle === null || lifetime.frameHandle === undefined) return
  const handle = lifetime.frameHandle
  const kind = lifetime.frameKind
  lifetime.frameHandle = null
  if (kind === "video-frame" && video && typeof video.cancelVideoFrameCallback === "function") {
    try {
      video.cancelVideoFrameCallback(handle)
    } catch {
    }
    return
  }
  if (typeof cancelAnimationFrame === "function") {
    try {
      cancelAnimationFrame(handle)
    } catch {
    }
  }
}

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

function InGameNightSuccessKillVideo({ eventId, src, finish }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [status, setStatus] = useState("loading")
  const attemptRef = useRef(null)

  const settleOnce = useCallback((lifetime, outcome, nextStatus) => {
    if (!lifetime || lifetime.settled) return
    lifetime.settled = true
    cancelPlaybackWatchdog(lifetime)
    cancelFrameLoop(lifetime, lifetime.video)
    if (nextStatus) setStatus(nextStatus)
    finish(outcome)
  }, [finish])

  const composeFrame = useCallback((lifetime) => {
    const video = lifetime.video
    if (!video) return
    const width = video.videoWidth
    const height = video.videoHeight
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return
    if (!Number.isFinite(video.readyState) || video.readyState < 2) return
    if (height % 2 !== 0) {
      settleOnce(lifetime, "ERROR", "error")
      return
    }
    const halfHeight = height / 2
    try {
      const workCanvas = lifetime.workCanvas
      const workCtx = lifetime.workCtx
      const displayCanvas = lifetime.displayCanvas
      const displayCtx = lifetime.displayCtx
      if (!workCanvas || !workCtx || !displayCanvas || !displayCtx) {
        settleOnce(lifetime, "ERROR", "error")
        return
      }
      workCanvas.width = width
      workCanvas.height = height
      workCtx.drawImage(video, 0, 0, width, height)
      const colorImage = workCtx.getImageData(0, 0, width, halfHeight)
      const maskImage = workCtx.getImageData(0, halfHeight, width, halfHeight)
      const composed = composeStackedAlpha(colorImage.data, maskImage.data)
      displayCanvas.width = width
      displayCanvas.height = halfHeight
      const outImage = displayCtx.createImageData(width, halfHeight)
      outImage.data.set(composed)
      displayCtx.putImageData(outImage, 0, 0)
    } catch {
      settleOnce(lifetime, "ERROR", "error")
    }
  }, [settleOnce])

  const scheduleFrame = useCallback((lifetime) => {
    if (!lifetime.alive || lifetime.settled) return
    const video = lifetime.video
    const step = () => {
      lifetime.frameHandle = null
      if (attemptRef.current !== lifetime || !lifetime.alive || lifetime.settled) return
      composeFrame(lifetime)
      if (!lifetime.alive || lifetime.settled) return
      scheduleFrame(lifetime)
    }
    if (video && typeof video.requestVideoFrameCallback === "function") {
      lifetime.frameKind = "video-frame"
      lifetime.frameHandle = video.requestVideoFrameCallback(step)
    } else if (typeof requestAnimationFrame === "function") {
      lifetime.frameKind = "raf"
      lifetime.frameHandle = requestAnimationFrame(step)
    }
  }, [composeFrame])

  const runPlayback = useCallback((lifetime, { retry = false } = {}) => {
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
      cancelPlaybackWatchdog(lifetime)
      if (isAutoplayBlockedRejection(err)) {
        if (!attemptWasMuted && !lifetime.silentLatch) {
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
    const lifetime = {
      alive: true, generation: 0, watchdogId: null, silentLatch: false, settled: false,
      frameHandle: null, frameKind: null, workCanvas: null, workCtx: null,
      displayCanvas: null, displayCtx: null, video: null,
    }
    attemptRef.current = lifetime
    setStatus("loading")

    const video = videoRef.current
    lifetime.video = video
    if (video) {
      try {
        video.pause()
        video.currentTime = 0
      } catch {
      }
    }

    let scheduled = true
    queueMicrotask(() => {
      if (!scheduled) return
      try {
        const displayCanvas = canvasRef.current
        const displayCtx = displayCanvas ? displayCanvas.getContext("2d") : null
        const workCanvas = document.createElement("canvas")
        const workCtx = workCanvas.getContext("2d")
        if (!displayCtx || !workCtx) {
          settleOnce(lifetime, "ERROR", "error")
          return
        }
        lifetime.displayCanvas = displayCanvas
        lifetime.displayCtx = displayCtx
        lifetime.workCanvas = workCanvas
        lifetime.workCtx = workCtx
      } catch {
        settleOnce(lifetime, "ERROR", "error")
        return
      }
      runPlayback(lifetime)
      if (!lifetime.settled) scheduleFrame(lifetime)
    })

    return () => {
      scheduled = false
      lifetime.alive = false
      cancelPlaybackWatchdog(lifetime)
      cancelFrameLoop(lifetime, lifetime.video)
      try {
        videoRef.current?.pause?.()
      } catch {
      }
    }
  }, [eventId, src, runPlayback, scheduleFrame, settleOnce])

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
        <canvas
          ref={canvasRef}
          className={INGAME_NIGHT_SUCCESS_ROLE_VIDEO_CLASS}
          data-ingame-night-success-canvas=""
        />
        <video
          ref={videoRef}
          src={src}
          muted
          playsInline
          preload="auto"
          onEnded={handleEnded}
          onError={handleError}
          style={INGAME_NIGHT_SUCCESS_HIDDEN_VIDEO_STYLE}
          aria-hidden="true"
          data-ingame-night-success-source-video=""
        />
        {status === "retry" ? (
          <>
            <div
              role="button"
              tabIndex={0}
              aria-label="화면을 눌러 다시 재생"
              {...{ [INGAME_KILL_REVEAL_RETRY_SURFACE_ATTR]: "" }}
              onClick={handleRetry}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") handleRetry() }}
              className="absolute inset-0 cursor-pointer"
            />
            <button type="button" className={`${INGAME_KILL_REVEAL_SKIP_BUTTON_CLASS} relative z-10`} onClick={handleSkip}>
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
  const finish = useCallback((outcome) => {
    if (controlled) {
      finishProp(outcome)
      return
    }
    owned.finish(outcome)
  }, [controlled, finishProp, owned.finish])
  const finalStatus = controlled ? finalStatusProp : owned.finalStatus
  const onClose = controlled ? onCloseProp : owned.onClose
  void assetStatusProp

  if (!open) return null

  if (current) {
    const video = resolveNightSuccessVideo(current)
    if (video) {
      return <InGameNightSuccessKillVideo eventId={current.eventId} src={video.src} finish={finish} />
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
