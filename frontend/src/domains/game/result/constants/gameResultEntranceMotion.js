// 결과 화면 나타나는 움직임: 본체 떨어지기·안쪽 차례로 나타나기·버튼 늦춤
// GameResultShell·GameResultPage가 씀

// 본체: 위에서 떨어지며 나타남
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

// 본체 떨어질 때 튕김
export const CONTENT_DROP_TRANSITION = {
  type: "spring",
  stiffness: 380,
  damping: 26,
  mass: 0.92,
}

// 안쪽 칸: 아래에서 올라오며 나타남
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

// 안쪽 칸별 늦춤 (띠 → 목록 → MVP)
export const INNER_REVEAL_DELAYS = {
  banner: 0.28,
  playerList: 0.34,
  mvp: 0.46,
}

// 대기방·로비 버튼 늦춤 (안쪽 다 나온 뒤)
export const LOBBY_BTN_REVEAL_DELAY = 0.64
