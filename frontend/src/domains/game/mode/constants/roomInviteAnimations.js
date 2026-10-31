export const PARCHMENT_FRAME_VARIANTS = {
  hidden: { opacity: 0, y: -14, rotate: -1, scale: 0.99 },
  visible: {
    opacity: 1, y: 0, rotate: 0, scale: 1,
    transition: { type: "spring", stiffness: 260, damping: 32, mass: 1, when: "beforeChildren", delayChildren: 0.22 },
  },
}

export const BUTTON_ROW_VARIANTS = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
}

export const BUTTON_VARIANTS = {
  hidden: { opacity: 0, y: 5 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}

export const BACK_BTN_VARIANTS = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.38 } },
}
