// 로비 UI 층 (메뉴·프로필·친구 영역을 감싸 영상 뒤에 나타나게 함)
// LobbyPage가 씀
import { motion } from "framer-motion"
import { LOBBY_UI_LAYER_CLASS } from "@/shared/constants/lobbyLayoutStyle.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

// 안 보일 땐 아래로 내린 채 투명하게 두고 눌리지 않게 막음
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
