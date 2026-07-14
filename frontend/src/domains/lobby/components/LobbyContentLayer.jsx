import { motion } from "framer-motion"
import { LOBBY_UI_LAYER_CLASS } from "@/domains/lobby/constants/lobbyLayoutStyle.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

// 인트로가 끝난 뒤 메뉴/프로필/친구 UI를 올리는 레이어입니다.
export default function LobbyContentLayer({ visible, children }) {
  return (
    <motion.div
      className={LOBBY_UI_LAYER_CLASS}
      initial={{ opacity: 0, y: 10 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
      transition={UI_REVEAL_TRANSITION}
      // UI가 숨겨진 동안에는 클릭이 배경 스킵 버튼으로 가야 하므로 pointerEvents를 끕니다.
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      {children}
    </motion.div>
  )
}
