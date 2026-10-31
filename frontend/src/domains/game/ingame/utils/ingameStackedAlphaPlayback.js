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

export function isAutoplayBlockedRejection(err) {
  return err !== null && typeof err === "object" && err.name === "NotAllowedError"
}
