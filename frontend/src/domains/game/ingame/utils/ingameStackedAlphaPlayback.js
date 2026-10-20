/**
 * stacked MP4(canvas 합성) 재생의 공통 정리·프레임 예약 취소.
 * InGameStackedAlphaVideo와 InGameNightSuccessKillVideo가 같이 쓴다.
 */

export function cancelPlaybackWatchdog(lifetime) {
  if (!lifetime || lifetime.watchdogId === null || lifetime.watchdogId === undefined) return
  clearTimeout(lifetime.watchdogId)
  lifetime.watchdogId = null
}

export function cancelFrameLoop(lifetime, video) {
  if (!lifetime || lifetime.frameHandle === null || lifetime.frameHandle === undefined) return
  const handle = lifetime.frameHandle
  const kind = lifetime.frameKind
  lifetime.frameHandle = null
  if (kind === "video-frame" && video && typeof video.cancelVideoFrameCallback === "function") {
    try {
      video.cancelVideoFrameCallback(handle)
    } catch {
      // 이미 분리된 요소의 취소는 무시한다.
    }
    return
  }
  if (typeof cancelAnimationFrame === "function") {
    try {
      cancelAnimationFrame(handle)
    } catch {
      // 위와 같은 이유.
    }
  }
}

export function isAutoplayBlockedRejection(err) {
  return err !== null && typeof err === "object" && err.name === "NotAllowedError"
}
