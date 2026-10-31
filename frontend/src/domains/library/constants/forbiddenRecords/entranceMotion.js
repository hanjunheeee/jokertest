export const FORBIDDEN_STORY_REVEAL_INITIAL = {
  opacity: 0,
  y: 28,
}

export const FORBIDDEN_STORY_REVEAL_ANIMATE = {
  opacity: 1,
  y: 0,
}

export const FORBIDDEN_STORY_REVEAL_TRANSITION = {
  duration: 0.5,
  ease: [0.22, 1, 0.36, 1],
}

export const FORBIDDEN_STORY_TITLE_TRANSITION = {
  ...FORBIDDEN_STORY_REVEAL_TRANSITION,
  delay: 0,
}

export const FORBIDDEN_STORY_BODY_TRANSITION = {
  ...FORBIDDEN_STORY_REVEAL_TRANSITION,
  delay: 0.1,
}

export const FORBIDDEN_STORY_PARAGRAPH_STAGGER = 0.05

export const FORBIDDEN_BLOOD_SPREAD_INITIAL = {
  opacity: 0,
  scale: 0.90,
}

export const FORBIDDEN_BLOOD_SPREAD_ANIMATE = {
  opacity: 1,
  scale: 1,
}

export const FORBIDDEN_BLOOD_SPREAD_TRANSITION = {
  duration: 2.35,
  ease: [0.1, 0.78, 0.16, 1],
}

export const FORBIDDEN_BLOOD_SPREAD_ORIGIN = "center"

export const FORBIDDEN_UNLOCK_REVEAL_INITIAL = {
  opacity: 0,
  y: 12,
}

export const FORBIDDEN_UNLOCK_REVEAL_ANIMATE = {
  opacity: 1,
  y: 0,
}

export const FORBIDDEN_UNLOCK_REVEAL_TRANSITION = {
  delay: 0.25,
  duration: 0.75,
  ease: [0.22, 1, 0.36, 1],
}