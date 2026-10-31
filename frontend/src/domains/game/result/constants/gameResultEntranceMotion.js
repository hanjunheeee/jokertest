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

export const GAME_RESULT_INNER_REVEAL_DELAYS = {
  banner: 0.28,
  playerList: 0.34,
  mvp: 0.46,
}

export const GAME_RESULT_LOBBY_BUTTON_REVEAL_DELAY = 0.64
