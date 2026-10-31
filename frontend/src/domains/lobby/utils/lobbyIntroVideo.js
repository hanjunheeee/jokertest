import { LOBBY_UI_REVEAL_BEFORE_END_SEC } from "@/domains/lobby/constants/lobbyIntro.js"

export function shouldRevealLobbyUi(video) {
  const { duration, currentTime } = video

  if (!duration || !Number.isFinite(duration)) return false

  return currentTime >= Math.max(0, duration - LOBBY_UI_REVEAL_BEFORE_END_SEC)
}

export function pauseLobbyIntroVideo(video) {
  video.pause()
}
