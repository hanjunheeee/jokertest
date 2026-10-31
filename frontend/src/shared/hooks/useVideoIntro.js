import { useEffect, useRef, useState } from "react"

const VIDEO_HOLD_BEFORE_END_SEC = 0.04

export const VIDEO_INTRO_LOAD_TIMEOUT_MS = 3000

function holdOnCurrentFrame(video) {
  try {
    video.pause()
  } catch {
  }
}

export function attachVideoIntroWatch(video, onDone, { timeoutMs = VIDEO_INTRO_LOAD_TIMEOUT_MS, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
  let done = false
  let timerId = null
  const finish = () => {
    if (done) return
    done = true
    if (timerId !== null) clearTimeoutFn(timerId)
    timerId = null
    holdOnCurrentFrame(video)
    onDone()
  }

  const syncPlayback = () => {
    const { duration, currentTime } = video
    if (!duration || !Number.isFinite(duration)) return
    const remaining = duration - currentTime
    if (remaining <= VIDEO_HOLD_BEFORE_END_SEC) finish()
  }
  const onMetadata = () => {
    if (timerId !== null) clearTimeoutFn(timerId)
    timerId = null
    syncPlayback()
  }

  video.addEventListener("timeupdate", syncPlayback)
  video.addEventListener("loadedmetadata", onMetadata)
  video.addEventListener("ended", finish)
  video.addEventListener("error", finish)
  if (video.readyState >= 1) onMetadata()
  else timerId = setTimeoutFn(finish, timeoutMs)
  syncPlayback()

  return () => {
    if (timerId !== null) clearTimeoutFn(timerId)
    video.removeEventListener("timeupdate", syncPlayback)
    video.removeEventListener("loadedmetadata", onMetadata)
    video.removeEventListener("ended", finish)
    video.removeEventListener("error", finish)
  }
}

export function useVideoIntro() {
  const bgVideoRef = useRef(null)
  const videoHeldRef = useRef(false)

  const [introDone, setIntroDone] = useState(false)

  const holdVideo = () => {
    if (videoHeldRef.current) return
    videoHeldRef.current = true
    const video = bgVideoRef.current
    if (video) holdOnCurrentFrame(video)
    setIntroDone(true)
  }

  const skipIntro = () => holdVideo()

  useEffect(() => {
    const video = bgVideoRef.current
    if (!video) {
      holdVideo()
      return undefined
    }
    return attachVideoIntroWatch(video, holdVideo)
  }, [])

  return { bgVideoRef, introDone, skipIntro }
}
