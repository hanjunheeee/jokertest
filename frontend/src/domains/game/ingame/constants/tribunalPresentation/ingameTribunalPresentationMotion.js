export const INGAME_TRIBUNAL_PRESENTATION_CARD_MOTION = {
  hidden: { opacity: 0, scale: 1.55, y: "-8%" },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 420, damping: 22, mass: 0.85 },
  },
}

export const INGAME_TRIBUNAL_PRESENTATION_BUTTON_MOTION = {
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

export const INGAME_TRIBUNAL_PRESENTATION_BACKDROP_MOTION = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.22, ease: "easeOut" } },
}

export const INGAME_TRIBUNAL_PRESENTATION_SPLIT_TRANSITION = {
  duration: 0.58,
  ease: [0.22, 1, 0.36, 1],
}

export const INGAME_TRIBUNAL_PRESENTATION_CHAT_MOTION = {
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
