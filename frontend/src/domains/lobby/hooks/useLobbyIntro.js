import { useEffect, useRef, useState } from "react"

const UI_REVEAL_BEFORE_END_SEC = 1
const VIDEO_HOLD_BEFORE_END_SEC = 0.04

/**
 * 인트로 재생 완료 여부를 저장하는 localStorage 키.
 * localStorage를 사용하는 이유: 새로고침 후에도 재생하지 않아야 하기 때문입니다.
 * 로그인·로그아웃 시 authStore에서 이 키를 삭제해 재생 여부를 초기화합니다.
 */
export const LOBBY_INTRO_SESSION_KEY = "lobby:intro_done"

/**
 * duration이 아직 로드되지 않았으면 false를 반환합니다.
 */
function shouldRevealUi(video) {
  const { duration, currentTime } = video
  if (!duration || !Number.isFinite(duration)) return false
  return currentTime >= Math.max(0, duration - UI_REVEAL_BEFORE_END_SEC)
}

/**
 * duration이 없으면 즉시 pause합니다.
 * 0.001초 앞에 고정하는 이유: 정확한 마지막 프레임을 보장하기 위함입니다.
 */
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

/**
 * 로비 인트로 영상·BGM 재생 제어 훅.
 *
 * 제어 흐름:
 *   1. 영상 종료 1초 전 → UI 페이드인 (revealUi)
 *   2. 영상 종료 0.04초 전 → 마지막 프레임 고정 (holdVideo)
 *   3. 클릭 → 즉시 건너뜀 (skipIntro)
 *
 * uiRevealedRef / videoHeldRef:
 *   이벤트 핸들러 내부에서 state는 클로저로 인해 최신값을 반영하지 못합니다.
 *   ref 뮤텍스로 중복 실행을 막습니다.
 */
export function useLobbyIntro() {
  const bgVideoRef = useRef(null)
  const audioRef = useRef(null)

  const alreadyPlayed = localStorage.getItem(LOBBY_INTRO_SESSION_KEY) === "1"

  const uiRevealedRef = useRef(alreadyPlayed)
  const videoHeldRef = useRef(alreadyPlayed)
  const [uiVisible, setUiVisible] = useState(alreadyPlayed)

  const revealUi = () => {
    if (uiRevealedRef.current) return
    uiRevealedRef.current = true
    localStorage.setItem(LOBBY_INTRO_SESSION_KEY, "1")
    setUiVisible(true)
  }

  const holdVideo = () => {
    const video = bgVideoRef.current
    if (!video || videoHeldRef.current) return
    videoHeldRef.current = true
    holdOnLastFrame(video)
  }

  /**
   * metadata 미로드 상태에서 pause하면 0초에 멈추므로
   * loadedmetadata 이후에 고정을 시도합니다.
   */
  const skipIntro = () => {
    if (uiRevealedRef.current) return
    revealUi()
    const video = bgVideoRef.current
    if (!video) return
    if (video.duration && Number.isFinite(video.duration)) {
      holdVideo()
      return
    }
    const onMetadata = () => {
      video.removeEventListener("loadedmetadata", onMetadata)
      holdVideo()
    }
    video.addEventListener("loadedmetadata", onMetadata)
  }

  // 이미 재생한 경우: metadata 로드 후 즉시 마지막 프레임으로 이동
  useEffect(() => {
    if (!alreadyPlayed) return
    const video = bgVideoRef.current
    if (!video) return
    const jumpToEnd = () => {
      if (video.duration && Number.isFinite(video.duration)) {
        video.currentTime = video.duration - 0.001
        video.pause()
      }
    }
    if (video.readyState >= 1) {
      jumpToEnd()
    } else {
      video.addEventListener("loadedmetadata", jumpToEnd, { once: true })
    }
    return () => video.removeEventListener("loadedmetadata", jumpToEnd)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 자동재생 정책에 막히면 첫 클릭 때 재시도
  useEffect(() => {
    const playBgm = () => {
      if (audioRef.current) {
        audioRef.current.play().catch(() => {})
      }
    }
    playBgm()
    window.addEventListener("click", playBgm, { once: true })
    return () => window.removeEventListener("click", playBgm)
  }, [])

  useEffect(() => {
    const video = bgVideoRef.current
    if (!video) return

    const syncPlayback = () => {
      const { duration, currentTime } = video
      if (!duration || !Number.isFinite(duration)) return
      const remaining = duration - currentTime
      if (shouldRevealUi(video)) revealUi()
      if (!videoHeldRef.current && remaining <= VIDEO_HOLD_BEFORE_END_SEC) holdVideo()
    }

    const onEnded = () => {
      // timeupdate가 마지막 타이밍을 놓쳤을 경우를 대비한 안전망
      revealUi()
      holdVideo()
    }

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

  return { bgVideoRef, audioRef, uiVisible, skipIntro }
}
