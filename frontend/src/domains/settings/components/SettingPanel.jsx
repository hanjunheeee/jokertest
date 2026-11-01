// 설정 창 (탭 줄 + 내용 칸, 처음 탭은 일반)
// pages/SettingPage.jsx가 씀
import { motion } from "framer-motion"
import { useState } from "react"
import SettingContentArea from "./SettingContentArea.jsx"
import SettingTabs from "./SettingTabs.jsx"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

const PANEL_CLASS =
  "absolute left-1/2 top-[clamp(6rem,15vh,8rem)] z-20 w-[min(56rem,88vw)] -translate-x-1/2"

// 인트로 끝나면 떠오르고, 그 전엔 누르지 못하게 막음
export default function SettingPanel({ visible }) {
  const [activeTab, setActiveTab] = useState("general")

  return (
    <motion.div
      className={PANEL_CLASS}
      initial={{ opacity: 0, y: 10 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      <SettingTabs activeTab={activeTab} onSelect={setActiveTab} />
      <SettingContentArea activeTab={activeTab} visible={visible} />
    </motion.div>
  )
}
