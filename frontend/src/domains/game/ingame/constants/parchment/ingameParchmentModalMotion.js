// 양피지 창 나타나기 움직임: 펼치기·커지기, 움직임 줄이기 설정
// 움직이는 양피지 창(InGameParchmentModalAnimated)이 사용

// 움직임 줄이기 켰을 때 거의 바로
export const REDUCED_TRANSITION = {
  duration: 0.01,
}

// 펼치기 움직임 (커지기도 같은 시간 씀)
export const PARCHMENT_UNFOLD_TRANSITION = {
  duration: 0.42,
  ease: [0.22, 1, 0.36, 1],
}

export const SCALE_TRANSITION =
  PARCHMENT_UNFOLD_TRANSITION

// 움직임 이름 → 처음·나타남·사라짐 모양 (모르는 이름이면 null)
export function getMotionPreset(animation) {
  // 펼치기: 위아래로 접혔다 펴짐 (줄이기면 투명도만)
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

  // 커지기: 살짝 작았다 커짐 (줄이기면 투명도만)
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
