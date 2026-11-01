export const REDUCED_TRANSITION = {
  duration: 0.01,
}

export const PARCHMENT_UNFOLD_TRANSITION = {
  duration: 0.42,
  ease: [0.22, 1, 0.36, 1],
}

export const SCALE_TRANSITION =
  PARCHMENT_UNFOLD_TRANSITION

export function getMotionPreset(animation) {
  if (animation === "parchment-unfold") {
    return {
      transition: PARCHMENT_UNFOLD_TRANSITION,
      reducedTransition: REDUCED_TRANSITION,
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
      transition: SCALE_TRANSITION,
      reducedTransition: REDUCED_TRANSITION,
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
