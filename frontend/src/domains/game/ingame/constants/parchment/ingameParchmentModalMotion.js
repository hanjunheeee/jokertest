/** prefers-reduced-motion일 때의 대체 트랜지션 — scale/이동 없이 아주 짧게 opacity만 */
export const INGAME_PARCHMENT_MODAL_REDUCED_TRANSITION = {
  duration: 0.01,
}

/** 역할 공개 — 파치먼트가 펼쳐지는 트랜지션 */
export const INGAME_PARCHMENT_MODAL_PARCHMENT_UNFOLD_TRANSITION = {
  duration: 0.42,
  ease: [0.22, 1, 0.36, 1],
}

/** 밤 역할 턴 안내 — 짧게 스케일 인 */
export const INGAME_PARCHMENT_MODAL_SCALE_TRANSITION =
  INGAME_PARCHMENT_MODAL_PARCHMENT_UNFOLD_TRANSITION

export function getInGameParchmentModalMotionPreset(animation) {
  if (animation === "parchment-unfold") {
    return {
      transition: INGAME_PARCHMENT_MODAL_PARCHMENT_UNFOLD_TRANSITION,
      reducedTransition: INGAME_PARCHMENT_MODAL_REDUCED_TRANSITION,
      transformOrigin: "center",
      getPanelInitial: (reduced) =>
        reduced ? { opacity: 0 } : { opacity: 0, scaleY: 0.06, y: -10 },
      getPanelAnimate: (reduced) =>
        reduced ? { opacity: 1 } : { opacity: 1, scaleY: 1, y: 0 },
      getPanelExit: (reduced) =>
        reduced ? { opacity: 0 } : { opacity: 0, scaleY: 0.08, y: -6 },
    }
  }

  if (animation === "scale") {
    return {
      transition: INGAME_PARCHMENT_MODAL_SCALE_TRANSITION,
      reducedTransition: INGAME_PARCHMENT_MODAL_REDUCED_TRANSITION,
      transformOrigin: "center",
      getPanelInitial: (reduced) =>
        reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 },
      getPanelAnimate: (reduced) =>
        reduced ? { opacity: 1 } : { opacity: 1, scale: 1 },
      getPanelExit: (reduced) =>
        reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 },
    }
  }

  return null
}
