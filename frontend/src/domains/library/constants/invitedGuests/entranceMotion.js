/** 초대받은 자들 spread — 4개 콘텐츠 블록 등장 (아래→위, stagger) */

export const INVITED_GUESTS_REVEAL_INITIAL = {
  opacity: 0,
  y: 14,
}

export const INVITED_GUESTS_REVEAL_ANIMATE = {
  opacity: 1,
  y: 0,
}

export const INVITED_GUESTS_REVEAL_TRANSITION = {
  duration: 0.46,
  ease: [0.22, 1, 0.36, 1],
}

/** 좌상 → 우상(탭·제목·랭킹) → 좌하 → 우하 */
export const INVITED_GUESTS_REVEAL_DELAYS = {
  leftUpper: 0,
  rightTabs: 0.06,
  rightTitle: 0.09,
  rightUpper: 0.12,
  leftLower: 0.18,
  rightLower: 0.27,
}

export function invitedGuestsRevealTransition(delay) {
  return {
    ...INVITED_GUESTS_REVEAL_TRANSITION,
    delay,
  }
}
