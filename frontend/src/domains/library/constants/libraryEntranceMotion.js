// 서고 책 등장 움직임 (책 떨어짐 → 목차 → 책갈피 → 내용 → 뒤로 버튼)
// 서고 화면(LibraryPage.jsx)과 book/ 컴포넌트들이 씀

// 책: 위에서 떨어지듯 내려옴 (spring)
export const BOOK_DROP_INIT = {
  opacity: 0,
  y: -44,
  scale: 0.99,
}

export const BOOK_DROP_ANIMATE = {
  opacity: 1,
  y: 0,
  scale: 1,
}

export const BOOK_DROP_TRANSITION = {
  type: "spring",
  stiffness: 380,
  damping: 26,
  mass: 0.92,
}

// 책 안쪽(목차·책갈피·내용) 공통 떠오름, 늦는 시간만 다름
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
  toc: 0.28,
  bookmarks: 0.4,
  content: 0.52,
}

// 뒤로 버튼은 내용 다음에 보임
export const BACK_BTN_REVEAL_DELAY = 0.62