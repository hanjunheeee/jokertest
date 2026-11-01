export const STORY_REVEAL_INIT = {
  opacity: 0,
  y: 28,
}

export const STORY_REVEAL_ANIMATE = {
  opacity: 1,
  y: 0,
}

export const STORY_REVEAL_TRANSITION = {
  duration: 0.5,
  ease: [0.22, 1, 0.36, 1],
}

export const STORY_TITLE_TRANSITION = {
  ...STORY_REVEAL_TRANSITION,
  delay: 0,
}

export const STORY_BODY_TRANSITION = {
  ...STORY_REVEAL_TRANSITION,
  delay: 0.1,
}

export const STORY_PARAGRAPH_STAGGER = 0.05

export const BLOOD_SPREAD_INIT = {
  opacity: 0,
  scale: 0.90,
}

export const BLOOD_SPREAD_ANIMATE = {
  opacity: 1,
  scale: 1,
}

export const BLOOD_SPREAD_TRANSITION = {
  duration: 2.35,
  ease: [0.1, 0.78, 0.16, 1],
}

export const BLOOD_SPREAD_ORIGIN = "center"

export const UNLOCK_REVEAL_INIT = {
  opacity: 0,
  y: 12,
}

export const UNLOCK_REVEAL_ANIMATE = {
  opacity: 1,
  y: 0,
}

export const UNLOCK_REVEAL_TRANSITION = {
  delay: 0.25,
  duration: 0.75,
  ease: [0.22, 1, 0.36, 1],
}