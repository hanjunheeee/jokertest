// 재판 연출 움직임: 카드·버튼·덮개·나뉘기·채팅
// 재판 연출 화면(InGameTribunalPresentationOverlay)이 사용

// 카드가 크게 떨어지듯 들어옴
export const CARD_MOTION = {
  hidden: { opacity: 0, scale: 1.55, y: "-8%" },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 420, damping: 22, mass: 0.85 },
  },
}

// 버튼은 delay만큼 늦게 튀어나옴
export const BTN_MOTION = {
  hidden: { opacity: 0, scale: 1.45, y: 18 },
  visible: (delay = 0) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 460,
      damping: 20,
      mass: 0.75,
      delay,
    },
  }),
}

// 덮개 서서히 어두워짐
export const BACKDROP_MOTION = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.22, ease: "easeOut" } },
}

// 카드·채팅이 양옆으로 나뉘는 움직임
export const SPLIT_TRANSITION = {
  duration: 0.58,
  ease: [0.22, 1, 0.36, 1],
}

// 채팅 칸 아래에서 올라옴
export const CHAT_MOTION = {
  hidden: { opacity: 0, y: 48 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.52,
      ease: [0.22, 1, 0.36, 1],
      delay: 0.08,
    },
  },
}
