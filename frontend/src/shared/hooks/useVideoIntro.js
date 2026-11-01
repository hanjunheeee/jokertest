// 인트로 영상을 끝나기 직전 장면에서 멈추고 인트로 끝 표시 (못 받으면 시간 제한 뒤 끝)
// lobby 인트로·settings·store 화면이 씀 (시험이 attachVideoIntroWatch를 직접 부름)
import { useEffect, useRef, useState } from "react"

// 끝나기 직전에 멈춰 마지막 장면을 남김
const HOLD_BEFORE_END_SEC = 0.04

// 영상 정보가 이 시간 안에 안 오면 인트로 끝으로 봄
export const LOAD_TIMEOUT_MS = 3000

// 지금 장면에서 멈춤
function holdOnCurrentFrame(video) {
  try {
    video.pause()
  } catch {
    // 멈춤 실패는 무시함 (지금 프레임에 멈추는 게 목적)
  }
}

// 끝 직전·끝·오류·시간 초과 중 먼저 온 것으로 한 번만 끝냄, 끄는 함수 돌려줌
export function attachVideoIntroWatch(video, onDone, { timeoutMs = LOAD_TIMEOUT_MS, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
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

  // 길이를 모르면 아직 판단 안 함
  const syncPlayback = () => {
    const { duration, currentTime } = video
    if (!duration || !Number.isFinite(duration)) return
    const remaining = duration - currentTime
    if (remaining <= HOLD_BEFORE_END_SEC) finish()
  }
  // 정보가 오면 시간 제한은 필요 없음
  const onMetadata = () => {
    if (timerId !== null) clearTimeoutFn(timerId)
    timerId = null
    syncPlayback()
  }

  video.addEventListener("timeupdate", syncPlayback)
  video.addEventListener("loadedmetadata", onMetadata)
  video.addEventListener("ended", finish)
  video.addEventListener("error", finish)
  // 이미 정보가 있으면 바로, 없으면 시간 제한을 걸어 둠
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

// introDone이 되면 화면이 UI를 보여 줌, skipIntro는 바로 끝내기
export function useVideoIntro() {
  const bgVideoRef = useRef(null)
  const videoHeldRef = useRef(false)

  const [introDone, setIntroDone] = useState(false)

  // 한 번만 처리
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
    // 영상이 없으면 바로 끝으로
    if (!video) {
      holdVideo()
      return undefined
    }
    return attachVideoIntroWatch(video, holdVideo)
  }, [])

  return { bgVideoRef, introDone, skipIntro }
}
