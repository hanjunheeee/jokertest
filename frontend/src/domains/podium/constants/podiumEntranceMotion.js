/** 명예의 전당 입장 — 기억의 서고와 동일한 spring 드롭 연출 */
export const PODIUM_CONTENT_DROP_INITIAL = {
  opacity: 0,
  y: -44,
  scale: 0.99,
}

export const PODIUM_CONTENT_DROP_ANIMATE = {
  opacity: 1,
  y: 0,
  scale: 1,
}

export const PODIUM_CONTENT_DROP_TRANSITION = {
  type: "spring",
  stiffness: 380,
  damping: 26,
  mass: 0.92,
}

/** 내부 요소 — 아래에서 올라오며 등장 */
export const PODIUM_INNER_REVEAL_INITIAL = {
  opacity: 0,
  y: 20,
}

export const PODIUM_INNER_REVEAL_ANIMATE = {
  opacity: 1,
  y: 0,
}

export const PODIUM_INNER_REVEAL_TRANSITION = {
  duration: 0.72,
  ease: [0.22, 1, 0.36, 1],
}

/** 헤더 → 1~3위 → 랭킹 테이블 순 stagger delay (초) */
export const PODIUM_INNER_REVEAL_DELAYS = {
  header: 0.28,
  topThree: 0.4,
  table: 0.52,
}

/** 뒤로가기 버튼 등장 delay */
export const PODIUM_BACK_BUTTON_REVEAL_DELAY = 0.62
