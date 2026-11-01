import { motion } from "framer-motion"
import { LOBBY_UI_LAYER_CLASS } from "@/shared/constants/lobbyLayoutStyle.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

export default function LobbyContentLayer({ visible, children }) {
  return (
    <motion.div
      className={LOBBY_UI_LAYER_CLASS}
      initial={{ opacity: 0, y: 10 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      {children}
    </motion.div>
  )
}
