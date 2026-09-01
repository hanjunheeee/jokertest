/** 게임 결과 입장 — 기억의 서고·명예의 전당과 동일한 spring 드롭 + stagger reveal */
export const GAME_RESULT_CONTENT_DROP_INITIAL = {
  opacity: 0,
  y: -44,
  scale: 0.99,
}

export const GAME_RESULT_CONTENT_DROP_ANIMATE = {
  opacity: 1,
  y: 0,
  scale: 1,
}

export const GAME_RESULT_CONTENT_DROP_TRANSITION = {
  type: "spring",
  stiffness: 380,
  damping: 26,
  mass: 0.92,
}

export const GAME_RESULT_INNER_REVEAL_INITIAL = {
  opacity: 0,
  y: 20,
}

export const GAME_RESULT_INNER_REVEAL_ANIMATE = {
  opacity: 1,
  y: 0,
}

export const GAME_RESULT_INNER_REVEAL_TRANSITION = {
  duration: 0.72,
  ease: [0.22, 1, 0.36, 1],
}

/** 배너 → 로스터 → 플레이어 목록 → MVP 순 stagger delay (초) */
export const GAME_RESULT_INNER_REVEAL_DELAYS = {
  banner: 0.28,
  roster: 0.34,
  playerList: 0.42,
  mvp: 0.54,
}

/** 로비로 버튼 등장 delay */
export const GAME_RESULT_LOBBY_BUTTON_REVEAL_DELAY = 0.64
