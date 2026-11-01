// 초대받은 손님 칸 등장 움직임 (칸마다 늦는 시간만 다름)
// InvitedGuestsSpread.jsx와 전적 칸·랭킹 칸 컴포넌트가 씀
export const REVEAL_INIT = {
  opacity: 0,
  y: 14,
}

export const REVEAL_ANIMATE = {
  opacity: 1,
  y: 0,
}

export const REVEAL_TRANSITION = {
  duration: 0.46,
  ease: [0.22, 1, 0.36, 1],
}

// 칸별 늦는 시간: 왼쪽 위 → 오른쪽 탭·제목·표 → 왼쪽 아래 → 오른쪽 아래
export const REVEAL_DELAYS = {
  leftUpper: 0,
  rightTabs: 0.06,
  rightTitle: 0.09,
  rightUpper: 0.12,
  leftLower: 0.18,
  rightLower: 0.27,
}

// 공통 움직임에 칸별 늦는 시간만 붙임
export function revealTransition(delay) {
  return {
    ...REVEAL_TRANSITION,
    delay,
  }
}