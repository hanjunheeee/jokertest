// 로비 첫 진입 영상 상수
// 로비 영상 훅(useLobbyIntro)·시험이 씀

// 영상 끝나기 몇 초 전에 UI를 보일지 (지금 아무도 안 씀)
export const UI_REVEAL_BEFORE_END_SEC = 1

// 영상 끝 몇 초 전에 멈출지 (지금 아무도 안 씀)
export const VIDEO_HOLD_BEFORE_END_SEC = 0.04

// 영상을 한 번 본 표시 키 (이름은 session이지만 localStorage라 브라우저에 계속 남음)
export const LOBBY_INTRO_SESSION_KEY = "lobby:intro_done"
