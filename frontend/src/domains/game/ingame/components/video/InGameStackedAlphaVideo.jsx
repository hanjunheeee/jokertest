import { useCallback, useEffect, useRef, useState } from "react"
import { composeStackedAlpha } from "../../utils/composeStackedAlpha.js"
import {
  cancelFrameLoop,
  cancelPlaybackWatchdog,
  isAutoplayBlockedRejection,
} from "../../utils/ingameStackedAlphaPlayback.js"
import {
  INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS,
  INGAME_KILL_REVEAL_RETRY_SURFACE_ATTR,
  INGAME_KILL_REVEAL_SKIP_BUTTON_CLASS,
  INGAME_KILL_REVEAL_SKIP_LABEL,
} from "../../constants/killReveal/ingameKillReveal.js"

const HIDDEN_VIDEO_STYLE = Object.freeze({ display: "none" })

export default function InGameStackedAlphaVideo({
  playbackKey,
  src,
  canvasClassName,
  sourceVideoDataAttr,
  onFinished,
  children = null,
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [status, setStatus] = useState("loading")
  const playbackKeyRef = useRef(playbackKey)
  const attemptRef = useRef(null)

  useEffect(() => {
    playbackKeyRef.current = playbackKey
  })

  const settleOnce = useCallback((lifetime, nextStatus) => {
    if (!lifetime || lifetime.settled) return
    lifetime.settled = true
    cancelPlaybackWatchdog(lifetime)
    cancelFrameLoop(lifetime, lifetime.video)
    if (nextStatus) setStatus(nextStatus)
  }, [])

  const composeFrame = useCallback((lifetime) => {
    const video = lifetime.video
    if (!video) return
    const width = video.videoWidth
    const height = video.videoHeight
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return
    if (!Number.isFinite(video.readyState) || video.readyState < 2) return
    if (height % 2 !== 0) {
      settleOnce(lifetime, "error")
      return
    }
    const halfHeight = height / 2
    try {
      const { workCanvas, workCtx, displayCanvas, displayCtx } = lifetime
      if (!workCanvas || !workCtx || !displayCanvas || !displayCtx) {
        settleOnce(lifetime, "error")
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
      settleOnce(lifetime, "error")
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
        settleOnce(lifetime, "error")
        return
      }
      setStatus((prev) => (prev === "loading" || prev === "playing" ? "watchdog" : prev))
    }, INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS)

    const video = videoRef.current
    if (!video) return

    try {
      video.muted = true
    } catch {
      settleOnce(lifetime, "error")
      return
    }

    const reportFailure = (err) => {
      if (!isCurrentAttempt()) return
      cancelPlaybackWatchdog(lifetime)
      if (isAutoplayBlockedRejection(err)) {
        setStatus("retry")
        return
      }
      settleOnce(lifetime, "error")
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
      alive: true, generation: 0, watchdogId: null, settled: false,
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
          settleOnce(lifetime, "error")
          return
        }
        lifetime.displayCanvas = displayCanvas
        lifetime.displayCtx = displayCtx
        lifetime.workCanvas = workCanvas
        lifetime.workCtx = workCtx
      } catch {
        settleOnce(lifetime, "error")
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
  }, [playbackKey, src, runPlayback, scheduleFrame, settleOnce])

  const handleEnded = () => {
    settleOnce(attemptRef.current)
    onFinished?.()
  }

  const handleError = () => settleOnce(attemptRef.current, "error")

  const handleSkip = () => {
    settleOnce(attemptRef.current)
    onFinished?.()
  }

  const handleRetry = () => {
    const lifetime = attemptRef.current
    if (!lifetime || !lifetime.alive || lifetime.settled) return
    const targetKey = playbackKeyRef.current
    setStatus("loading")
    runPlayback(lifetime, { retry: true })
    if (playbackKeyRef.current !== targetKey) return
    scheduleFrame(lifetime)
  }

  const sourceVideoAttr = sourceVideoDataAttr
    ? { [sourceVideoDataAttr]: "" }
    : {}

  return (
    <>
      <canvas ref={canvasRef} className={canvasClassName} />
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        preload="auto"
        onEnded={handleEnded}
        onError={handleError}
        style={HIDDEN_VIDEO_STYLE}
        aria-hidden="true"
        {...sourceVideoAttr}
      />
      {children}
      {status === "retry" ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="화면을 눌러 다시 재생"
          {...{ [INGAME_KILL_REVEAL_RETRY_SURFACE_ATTR]: "" }}
          onClick={handleRetry}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") handleRetry() }}
          className="absolute inset-0 cursor-pointer"
        />
      ) : null}
      {status === "watchdog" || status === "error" ? (
        <button type="button" className={INGAME_KILL_REVEAL_SKIP_BUTTON_CLASS} onClick={handleSkip}>
          {INGAME_KILL_REVEAL_SKIP_LABEL}
        </button>
      ) : null}
    </>
  )
}
