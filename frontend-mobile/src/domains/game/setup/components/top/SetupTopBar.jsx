// 방 설정 위 줄: 소리 조절 (뒤로는 shell 하단)
// pages/GameSetupPage가 씀
import { motion } from "framer-motion"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import SoundControl from "@m/shared/ui/sound/SoundControl.jsx"

export default function SetupTopBar({ visible }) {
  return (
    <motion.header
      className="flex h-13 shrink-0 items-center justify-end gap-2 px-0.5 land:h-11"
      initial={{ opacity: 0, y: 8 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      <SoundControl look="setup" />
    </motion.header>
  )
}
