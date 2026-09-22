// 파일 역할: useVideoIntro.js - React 상태와 부수효과를 묶는 커스텀 훅입니다.
import { useEffect, useRef, useState } from "react"

const VIDEO_HOLD_BEFORE_END_SEC = 0.04

// 영상이 이 시간 안에 메타데이터조차 주지 않으면(파일 없음·디코더 거부·느린 네트워크) 인트로를
// 끝난 것으로 본다 — 그 전까지는 SettingIntroSkipLayer가 화면 전체의 클릭을 삼키므로, 영상이
// 영영 안 뜨면 설정 화면의 모든 버튼이 죽은 것처럼 보였다(2026-09-22 실제 인수).
export const VIDEO_INTRO_LOAD_TIMEOUT_MS = 3000

/**
 * 영상을 지금 보이는 프레임에서 멈춘다. 예전에는 `currentTime = duration - 0.001`로 끝 프레임까지
 * 하드 시크한 뒤 멈췄는데, 마지막 키프레임 너머로 시크하면 디코더가 깨진·검은 프레임을 내놓아
 * "클릭하면 이상하게 나오는" 문제가 됐다. 끝까지 자연 재생된 경우(ended)는 이미 끝 프레임이다.
 */
function holdOnCurrentFrame(video) {
  try {
    video.pause()
  } catch {
    // 분리된 요소의 pause는 무시한다.
  }
}

/**
 * 인트로 영상에 "끝났다" 판정을 붙인다(순수 함수 — React 없이 시험한다).
 *   - 남은 시간이 VIDEO_HOLD_BEFORE_END_SEC 이하이거나 ended → onDone
 *   - error(소스 없음·디코드 실패) → onDone  (stalled는 정상 버퍼링 중에도 오므로 쓰지 않는다)
 *   - loadedmetadata가 timeoutMs 안에 오지 않음 → onDone
 * onDone은 한 번만 불린다. 반환값은 해제 함수.
 */
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

/** 진입 인트로 영상 — 끝나거나 스킵·오류·로드 지연 시 introDone (설정·상점·로비 공용) */
export function useVideoIntro() {
  const bgVideoRef = useRef(null)
  const videoHeldRef = useRef(false)

  // 인트로 영상이 끝났거나 사용자가 건너뛰어서 UI를 보여줘도 되는지 표시합니다.
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
      // 영상 요소가 없는 화면(이미 본 인트로를 PNG로 대신하는 경우 등)은 바로 UI를 연다.
      holdVideo()
      return undefined
    }
    return attachVideoIntroWatch(video, holdVideo)
  }, [])

  return { bgVideoRef, introDone, skipIntro }
}
