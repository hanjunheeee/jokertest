/** 기억의 서고 입장 — 책이 툭 내려놓이는 연출 */
export const LIBRARY_BOOK_DROP_INITIAL = {
  opacity: 0,
  y: -44,
  scale: 0.99,
}

export const LIBRARY_BOOK_DROP_ANIMATE = {
  opacity: 1,
  y: 0,
  scale: 1,
}

export const LIBRARY_BOOK_DROP_TRANSITION = {
  type: "spring",
  stiffness: 380,
  damping: 26,
  mass: 0.92,
}

/** 책 안 요소 — 스멀스멀 아래에서 올라오는 연출 */
export const LIBRARY_INNER_REVEAL_INITIAL = {
  opacity: 0,
  y: 20,
}

export const LIBRARY_INNER_REVEAL_ANIMATE = {
  opacity: 1,
  y: 0,
}

export const LIBRARY_INNER_REVEAL_TRANSITION = {
  duration: 0.72,
  ease: [0.22, 1, 0.36, 1],
}

/** 목차 → 책갈피 → 본문 순 stagger delay (초) */
export const LIBRARY_INNER_REVEAL_DELAYS = {
  toc: 0.28,
  bookmarks: 0.4,
  content: 0.52,
}

/** 뒤로가기 버튼 등장 delay */
export const LIBRARY_BACK_BUTTON_REVEAL_DELAY = 0.62
