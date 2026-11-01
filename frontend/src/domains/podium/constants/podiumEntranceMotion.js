export const CONTENT_DROP_INIT = {
  opacity: 0,
  y: -44,
  scale: 0.99,
}

export const CONTENT_DROP_ANIMATE = {
  opacity: 1,
  y: 0,
  scale: 1,
}

export const CONTENT_DROP_TRANSITION = {
  type: "spring",
  stiffness: 380,
  damping: 26,
  mass: 0.92,
}

export const INNER_REVEAL_INIT = {
  opacity: 0,
  y: 20,
}

export const INNER_REVEAL_ANIMATE = {
  opacity: 1,
  y: 0,
}

export const INNER_REVEAL_TRANSITION = {
  duration: 0.72,
  ease: [0.22, 1, 0.36, 1],
}

export const INNER_REVEAL_DELAYS = {
  header: 0.28,
  topThree: 0.4,
  table: 0.52,
}

export const BACK_BTN_REVEAL_DELAY = 0.62
