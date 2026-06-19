import { useEffect, useRef, useState } from "react"

const VIDEO_HOLD_BEFORE_END_SEC = 0.04 // 종료 0.04초 전에 마지막 프레임 고정

/**
 * 영상을 마지막 프레임에 고정시킵니다.
 * duration이 아직 없으면 즉시 일시정지합니다.
 */
function holdOnLastFrame(video) {
  const { duration, currentTime } = video
  if (!duration || !Number.isFinite(duration)) {
    video.pause()
    return
  }
  const target = Math.max(0, duration - 0.001) // 마지막 프레임 위치
  if (currentTime < target - 0.02) {
    video.currentTime = target
  }
  video.pause()
}

/**
 * 설정 페이지 배경 영상 인트로 제어 훅.
 *
 * 영상이 끝나면 마지막 프레임에 고정하고 introDone을 true로 전환합니다.
 * 사용자가 클릭하면 skipIntro로 즉시 건너뜁니다.
 *
 * videoHeldRef: 리렌더 사이에서도 "이미 고정됨" 여부를 추적합니다.
 * state(introDone)만으로는 이벤트 핸들러 내 클로저 문제로 중복 실행될 수 있습니다.
 */
export function useVideoIntro() {
  const bgVideoRef = useRef(null)
  const videoHeldRef = useRef(false) // 마지막 프레임 고정이 이미 실행됐는지 — 중복 방지
  const [introDone, setIntroDone] = useState(false) // true가 되면 패널·버튼 페이드인

  /** 영상을 마지막 프레임에 한 번만 고정합니다. */
  const holdVideo = () => {
    const video = bgVideoRef.current
    if (!video || videoHeldRef.current) return
    videoHeldRef.current = true
    holdOnLastFrame(video)
    setIntroDone(true) // 고정 완료 → UI 전환 트리거
  }

  /** 영상 종료를 기다리지 않고 즉시 인트로를 건너뜁니다. */
  const skipIntro = () => {
    if (videoHeldRef.current) return // 이미 끝났으면 무시
    holdVideo()
  }

  // 영상 재생 진행에 따라 마지막 프레임 고정 타이밍을 감시
  useEffect(() => {
    const video = bgVideoRef.current
    if (!video) return

    const syncPlayback = () => {
      const { duration, currentTime } = video
      if (!duration || !Number.isFinite(duration)) return
      const remaining = duration - currentTime
      if (!videoHeldRef.current && remaining <= VIDEO_HOLD_BEFORE_END_SEC) {
        holdVideo() // 종료 직전 — 마지막 프레임 고정
      }
    }

    const onEnded = () => holdVideo() // timeupdate가 타이밍을 놓쳤을 경우 안전망

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
