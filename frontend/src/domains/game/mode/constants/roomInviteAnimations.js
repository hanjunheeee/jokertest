// 방코드 입력 화면 움직임: 양피지 틀·버튼 줄·버튼·뒤로 버튼
// RoomInvitePage가 씀

// 양피지 틀: 다 나온 뒤 안쪽이 나오게 (0.22초 늦춤)
export const PARCHMENT_FRAME_VARIANTS = {
  hidden: { opacity: 0, y: -14, rotate: -1, scale: 0.99 },
  visible: {
    opacity: 1, y: 0, rotate: 0, scale: 1,
    transition: { type: "spring", stiffness: 260, damping: 32, mass: 1, when: "beforeChildren", delayChildren: 0.22 },
  },
}

// 버튼 줄: 버튼 하나씩 0.05초 차이로
export const BUTTON_ROW_VARIANTS = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
}

// 버튼 하나: 아래에서 살짝 올라옴
export const BUTTON_VARIANTS = {
  hidden: { opacity: 0, y: 5 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}

// 뒤로 버튼: 0.38초 늦게 나타남
export const BACK_BTN_VARIANTS = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.38 } },
}
