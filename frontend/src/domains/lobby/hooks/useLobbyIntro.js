// 로비 배경 영상 첫 진입 처리 (한 번 본 브라우저는 영상을 멈추고 UI를 바로 보임)
// LobbyPage가 씀
import { useEffect, useRef } from "react"
import { LOBBY_INTRO_SESSION_KEY } from "@/domains/lobby/constants/lobbyIntro.js"
import { useVideoIntro } from "@/shared/hooks/useVideoIntro.js"

// 영상 ref·UI 보일지·건너뛰기를 줌
export function useLobbyIntro() {
  const { bgVideoRef, introDone, skipIntro } = useVideoIntro()

  // 처음 그릴 때 한 번만 읽음 (영상 끝나 저장해도 이번 화면 값은 안 바뀌게)
  const alreadyPlayedRef = useRef(null)
  if (alreadyPlayedRef.current === null) {
    alreadyPlayedRef.current = localStorage.getItem(LOBBY_INTRO_SESSION_KEY) === "1"
  }
  const alreadyPlayed = alreadyPlayedRef.current

  // 이미 봤으면 영상 정보가 읽힌 뒤 바로 멈춤
  useEffect(() => {
    if (!alreadyPlayed) return

    const video = bgVideoRef.current
    if (!video) return

    const pauseIntro = () => video.pause()

    if (video.readyState >= 1) {
      pauseIntro()
    } else {
      video.addEventListener("loadedmetadata", pauseIntro, { once: true })
    }

    return () => video.removeEventListener("loadedmetadata", pauseIntro)
  }, [])

  // 영상이 끝나면(건너뛰기 포함) 본 걸로 남김
  useEffect(() => {
    if (!introDone) return
    localStorage.setItem(LOBBY_INTRO_SESSION_KEY, "1")
  }, [introDone])

  // 이미 봤거나 영상이 끝났으면 UI 보임
  const uiVisible = alreadyPlayed || introDone

  return { bgVideoRef, uiVisible, skipIntro }
}
