// 방코드 입력 양피지 프레임의 등장 애니메이션입니다.
export const PARCHMENT_FRAME_VARIANTS = {
  hidden: { opacity: 0, y: -14, rotate: -1, scale: 0.99 },
  visible: {
    opacity: 1, y: 0, rotate: 0, scale: 1,
    transition: { type: "spring", stiffness: 260, damping: 32, mass: 1, when: "beforeChildren", delayChildren: 0.22 },
  },
}

// 하단 버튼들이 순서대로 나타나게 하는 부모 variants입니다.
export const BUTTON_ROW_VARIANTS = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
}

// 취소/참여하기 버튼 각각의 등장 애니메이션입니다.
export const BUTTON_VARIANTS = {
  hidden: { opacity: 0, y: 5 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}

// 방코드 화면 뒤로가기 버튼 등장 애니메이션입니다.
export const BACK_BTN_VARIANTS = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.38 } },
}
