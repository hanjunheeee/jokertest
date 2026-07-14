import { useEffect, useRef, useState } from "react"
import {
  LOBBY_INTRO_SESSION_KEY,
  LOBBY_VIDEO_HOLD_BEFORE_END_SEC,
} from "@/domains/lobby/constants/lobbyIntro.js"
import {
  holdLobbyVideoOnLastFrame,
  shouldRevealLobbyUi,
} from "@/domains/lobby/utils/lobbyIntroVideo.js"
import { useBgmAutoplay } from "@/shared/hooks/useBgmAutoplay.js"

// 로비 인트로 영상, 배경음악, UI 표시 타이밍을 묶어서 관리하는 훅입니다.
export function useLobbyIntro() {
  // 로비 인트로 배경 영상 태그를 직접 제어하기 위한 ref입니다.
  // 컴포넌트에서 <video ref={bgVideoRef}>로 연결해서 currentTime, pause() 등을 사용합니다.
  const bgVideoRef = useRef(null)

  // 로비 배경음악 audio 태그를 직접 제어하기 위한 ref입니다.
  // 컴포넌트에서 <audio ref={audioRef}>로 연결하고, useBgmAutoplay가 이 ref로 재생을 시도합니다.
  const audioRef = useRef(null)

  // 이전에 인트로를 이미 봤다면 로비 UI를 바로 보여주기 위한 값입니다.
  const alreadyPlayed = localStorage.getItem(LOBBY_INTRO_SESSION_KEY) === "1"

  // UI를 이미 보여줬는지 기억합니다. 같은 처리가 여러 번 실행되는 것을 막습니다.
  const uiRevealedRef = useRef(alreadyPlayed)

  // 영상을 이미 마지막 프레임에 고정했는지 기억합니다.
  const videoHeldRef = useRef(alreadyPlayed)

  // 인트로가 끝나서 로비 UI를 화면에 보여줘도 되는지 표시합니다.
  const [uiVisible, setUiVisible] = useState(alreadyPlayed)

  const revealUi = () => {
    // 이미 UI를 보여준 뒤라면 localStorage 저장과 setState를 다시 하지 않습니다.
    if (uiRevealedRef.current) return

    uiRevealedRef.current = true
    localStorage.setItem(LOBBY_INTRO_SESSION_KEY, "1")
    setUiVisible(true)
  }

  const holdVideo = () => {
    const video = bgVideoRef.current

    // video가 아직 연결되지 않았거나 이미 고정했다면 아무것도 하지 않습니다.
    if (!video || videoHeldRef.current) return

    videoHeldRef.current = true
    holdLobbyVideoOnLastFrame(video)
  }

  const skipIntro = () => {
    // 이미 UI가 열린 상태라면 스킵할 것이 없으므로 바로 끝냅니다.
    if (uiRevealedRef.current) return

    // 스킵을 누르면 영상 상태와 상관없이 UI는 먼저 보여줍니다.
    revealUi()

    const video = bgVideoRef.current
    if (!video) return

    // 영상 길이를 이미 알고 있으면 바로 마지막 프레임에 고정합니다.
    if (video.duration && Number.isFinite(video.duration)) {
      holdVideo()
      return
    }

    // 영상 길이를 아직 모르면 metadata가 준비된 뒤 마지막 프레임에 고정합니다.
    const onMetadata = () => {
      video.removeEventListener("loadedmetadata", onMetadata)
      holdVideo()
    }

    video.addEventListener("loadedmetadata", onMetadata)
  }

  useEffect(() => {
    // 인트로를 처음 보는 사용자는 영상이 정상 재생되어야 하므로 여기서 처리하지 않습니다.
    if (!alreadyPlayed) return

    const video = bgVideoRef.current
    if (!video) return

    // 이미 본 인트로라면 처음부터 마지막 프레임으로 보내고 멈춥니다.
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
  }, []) // mount 시점에 "이미 본 인트로인지" 한 번만 확인하면 됩니다.

  useEffect(() => {
    const video = bgVideoRef.current
    if (!video) return

    // 영상 재생 위치를 보면서 UI 표시와 마지막 프레임 고정을 처리합니다.
    const syncPlayback = () => {
      const { duration, currentTime } = video
      if (!duration || !Number.isFinite(duration)) return

      const remaining = duration - currentTime

      // 영상 끝나기 직전에 로비 UI를 먼저 보여줍니다.
      if (shouldRevealLobbyUi(video)) revealUi()

      // 영상이 완전히 끝나기 아주 직전에 마지막 프레임에 고정합니다.
      if (!videoHeldRef.current && remaining <= LOBBY_VIDEO_HOLD_BEFORE_END_SEC) holdVideo()
    }

    const onEnded = () => {
      // timeupdate가 늦거나 누락되어도 ended에서는 반드시 UI 표시와 영상 고정을 처리합니다.
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
  }, []) // video 이벤트 연결은 mount 시점에 한 번만 하면 됩니다.

  // 로비 배경음악 자동 재생을 시도합니다.
  useBgmAutoplay(audioRef)

  // 화면 컴포넌트가 video/audio ref를 태그에 붙이고, uiVisible/skipIntro를 사용할 수 있게 반환합니다.
  return { bgVideoRef, audioRef, uiVisible, skipIntro }
}
