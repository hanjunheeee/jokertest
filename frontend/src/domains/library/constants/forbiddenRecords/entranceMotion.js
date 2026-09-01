/** 금지된 기록 spread — 좌·우 페이지 전환/등장 모션 */

/** 좌측 원고 — 페이지 넘김마다 아래에서 스르륵 올라옴 */
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

/** 우측 잠금 — 핏자국이 중앙에서 스멀스멀 퍼지는 연출 */
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

/** 해금 조건·진행도 — 핏자국이 퍼진 뒤 서서히 드러남 */
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
