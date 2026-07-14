import { LOBBY_UI_REVEAL_BEFORE_END_SEC } from "@/domains/lobby/constants/lobbyIntro.js"

export function shouldRevealLobbyUi(video) {
  const { duration, currentTime } = video

  // 영상 길이를 아직 모르면 UI를 보여줄 타이밍도 계산할 수 없습니다.
  if (!duration || !Number.isFinite(duration)) return false

  return currentTime >= Math.max(0, duration - LOBBY_UI_REVEAL_BEFORE_END_SEC)
}

export function holdLobbyVideoOnLastFrame(video) {
  const { duration, currentTime } = video

  // 영상 길이를 모르는 경우에는 우선 현재 위치에서 멈춥니다.
  if (!duration || !Number.isFinite(duration)) {
    video.pause()
    return
  }

  // 완전히 끝나는 지점보다 아주 살짝 앞에서 멈춰 마지막 프레임을 유지합니다.
  const target = Math.max(0, duration - 0.001)

  if (currentTime < target - 0.02) {
    video.currentTime = target
  }

  video.pause()
}
