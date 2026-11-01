// 밤 성공 사망 영상 재생 훅: 재생·감시 타이머·프레임 합치기·소리 맞추기, 끝나면 결과를 한 번만 알림
// 밤 성공 사망 영상(components/nightSuccess/InGameNightSuccessKillVideo)이 사용 (재생 기록 하나를 모든 단계가 같이 고쳐 써서 한 파일에 둠)
import { useCallback, useEffect, useRef, useState } from "react"
import { getSfxMix, subscribeSfxMix } from "../../../../shared/hooks/useSfxRuntime.js"
import {
  applyMixToVideo,
  cancelFrameLoop,
  cancelPlaybackWatchdog,
  drawStackedFrame,
  isAutoplayBlockedRejection,
} from "../utils/ingameStackedAlphaPlayback.js"
import { INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS } from "../constants/killReveal/ingameKillReveal.js"

export function useNightSuccessKillVideo({ eventId, src, finish }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [status, setStatus] = useState("loading")
  const attemptRef = useRef(null)

  // 재생 한 번에 결과는 한 번만 (타이머·프레임 반복도 같이 끔)
  const settleOnce = useCallback((lifetime, outcome, nextStatus) => {
    if (!lifetime || lifetime.settled) return
    lifetime.settled = true
    cancelPlaybackWatchdog(lifetime)
    cancelFrameLoop(lifetime, lifetime.video)
    if (nextStatus) setStatus(nextStatus)
    finish(outcome)
  }, [finish])

  const composeFrame = useCallback((lifetime) => {
    drawStackedFrame(lifetime, () => settleOnce(lifetime, "ERROR", "error"))
  }, [settleOnce])

  // 다음 프레임 예약 (영상 프레임 콜백이 있으면 그걸, 없으면 애니메이션 프레임)
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

  // 재생 시도: 감시 타이머를 걸고 재생, 자동 재생이 막히면 소리 끄고 한 번 더, 그래도 막히면 다시 재생 화면
  const runPlayback = useCallback((lifetime, { retry = false } = {}) => {
    if (lifetime.settled) return

    const generation = lifetime.generation + 1
    lifetime.generation = generation
    const isCurrentAttempt = () =>
      attemptRef.current === lifetime && lifetime.alive && lifetime.generation === generation

    // 시간 안에 안 끝나면 첫 시도는 건너뛰기 버튼, 다시 시도면 오류로 끝냄
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

  // 사건·영상이 바뀔 때마다 새 재생 기록으로 처음부터 (캔버스 준비는 이번 틱 뒤에)
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

  // 재생 중 효과음 설정이 바뀌면 다시 시작하지 않고 소리만 맞춤
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

  return { videoRef, canvasRef, status, handleEnded, handleError, handleSkip, handleRetry }
}
