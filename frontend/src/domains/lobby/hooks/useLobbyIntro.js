import { useEffect, useRef } from "react"
import { LOBBY_INTRO_SESSION_KEY } from "@/domains/lobby/constants/lobbyIntro.js"
import { useVideoIntro } from "@/shared/hooks/useVideoIntro.js"

export function useLobbyIntro() {
  const { bgVideoRef, introDone, skipIntro } = useVideoIntro()

  const alreadyPlayedRef = useRef(null)
  if (alreadyPlayedRef.current === null) {
    alreadyPlayedRef.current = localStorage.getItem(LOBBY_INTRO_SESSION_KEY) === "1"
  }
  const alreadyPlayed = alreadyPlayedRef.current

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
  }, []) // mount 시점에 "이미 본 인트로인지" 한 번만 확인하면 됩니다.

  useEffect(() => {
    if (!introDone) return
    localStorage.setItem(LOBBY_INTRO_SESSION_KEY, "1")
  }, [introDone])

  const uiVisible = alreadyPlayed || introDone

  return { bgVideoRef, uiVisible, skipIntro }
}
