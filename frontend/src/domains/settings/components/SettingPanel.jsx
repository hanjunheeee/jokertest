// 파일 역할: SettingPanel.jsx - 화면을 구성하는 컴포넌트입니다.
import { motion } from "framer-motion"
import { useState } from "react"
import SettingContentArea from "./SettingContentArea.jsx"
import SettingTabs from "./SettingTabs.jsx"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

const PANEL_CLASS =
  "absolute left-1/2 top-[42%] z-20 w-[min(56rem,88vw)] -translate-x-1/2 -translate-y-1/2"

export default function SettingPanel({ visible }) {
  // 현재 선택된 설정 탭 id입니다.
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
