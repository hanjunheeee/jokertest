// 파일 역할: useVideoIntro.js - React 상태와 부수효과를 묶는 커스텀 훅입니다.
import { useEffect, useRef, useState } from "react"

const VIDEO_HOLD_BEFORE_END_SEC = 0.04

function holdOnLastFrame(video) {
  const { duration, currentTime } = video
  if (!duration || !Number.isFinite(duration)) {
    video.pause()
    return
  }
  const target = Math.max(0, duration - 0.001)
  if (currentTime < target - 0.02) {
    video.currentTime = target
  }
  video.pause()
}

export function useVideoIntro() {
  const bgVideoRef = useRef(null)
  const videoHeldRef = useRef(false)

  // 인트로 영상이 끝났거나 사용자가 건너뛰어서 설정 UI를 보여줘도 되는지 표시합니다.
  const [introDone, setIntroDone] = useState(false)

  const holdVideo = () => {
    const video = bgVideoRef.current
    if (!video || videoHeldRef.current) return
    videoHeldRef.current = true
    holdOnLastFrame(video)
    setIntroDone(true)
  }

  const skipIntro = () => {
    if (videoHeldRef.current) return
    holdVideo()
  }

  useEffect(() => {
    const video = bgVideoRef.current
    if (!video) return

    const syncPlayback = () => {
      const { duration, currentTime } = video
      if (!duration || !Number.isFinite(duration)) return
      const remaining = duration - currentTime
      if (!videoHeldRef.current && remaining <= VIDEO_HOLD_BEFORE_END_SEC) {
        holdVideo()
      }
    }

    const onEnded = () => holdVideo()

    video.addEventListener("timeupdate", syncPlayback)
    video.addEventListener("loadedmetadata", syncPlayback)
    video.addEventListener("ended", onEnded)
    syncPlayback()

    return () => {
      video.removeEventListener("timeupdate", syncPlayback)
      video.removeEventListener("loadedmetadata", syncPlayback)
      video.removeEventListener("ended", onEnded)
    }
  }, [])

  return { bgVideoRef, introDone, skipIntro }
}
