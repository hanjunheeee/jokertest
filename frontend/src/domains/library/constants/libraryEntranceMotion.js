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

export const LIBRARY_INNER_REVEAL_DELAYS = {
  toc: 0.28,
  bookmarks: 0.4,
  content: 0.52,
}

export const LIBRARY_BACK_BUTTON_REVEAL_DELAY = 0.62