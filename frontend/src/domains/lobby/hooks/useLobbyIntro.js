import { useEffect, useRef } from "react"
import { LOBBY_INTRO_SESSION_KEY } from "@/domains/lobby/constants/lobbyIntro.js"
import { useVideoIntro } from "@/shared/hooks/useVideoIntro.js"

// 로비 인트로 영상과 UI 표시 타이밍을 묶어서 관리하는 훅입니다.
// 영상 생명주기(마지막 프레임 고정·스킵·ended 처리)는 공용 useVideoIntro가 담당하고,
// 여기서는 "이미 인트로를 봤는지" 저장만 추가로 관리합니다. BGM은 App의 GlobalBgmLayer가 담당합니다.
export function useLobbyIntro() {
  const { bgVideoRef, introDone, skipIntro } = useVideoIntro()

  // 이전에 인트로를 이미 봤다면 로비 UI를 바로 보여주기 위한 값입니다.
  // 첫 렌더에서 한 번만 읽어 두어야 저장 직후 값이 바뀌어도 이번 방문 판정이 흔들리지 않습니다.
  const alreadyPlayedRef = useRef(null)
  if (alreadyPlayedRef.current === null) {
    alreadyPlayedRef.current = localStorage.getItem(LOBBY_INTRO_SESSION_KEY) === "1"
  }
  const alreadyPlayed = alreadyPlayedRef.current

  // 이미 본 인트로라면 영상은 재생하지 않고 PNG 배경만 사용합니다.
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

  // 인트로가 끝나거나 스킵되면 다음 방문부터 바로 UI를 보여주도록 저장합니다.
  useEffect(() => {
    if (!introDone) return
    localStorage.setItem(LOBBY_INTRO_SESSION_KEY, "1")
  }, [introDone])

  // 재방문이면 introDone을 기다리지 않고 처음부터 UI를 보여줍니다.
  const uiVisible = alreadyPlayed || introDone

  return { bgVideoRef, uiVisible, skipIntro }
}
