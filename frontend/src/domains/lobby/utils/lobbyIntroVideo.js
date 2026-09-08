import { LOBBY_UI_REVEAL_BEFORE_END_SEC } from "@/domains/lobby/constants/lobbyIntro.js"

export function shouldRevealLobbyUi(video) {
  const { duration, currentTime } = video

  // 영상 길이를 아직 모르면 UI를 보여줄 타이밍도 계산할 수 없습니다.
  if (!duration || !Number.isFinite(duration)) return false

  return currentTime >= Math.max(0, duration - LOBBY_UI_REVEAL_BEFORE_END_SEC)
}

export function pauseLobbyIntroVideo(video) {
  video.pause()
}
