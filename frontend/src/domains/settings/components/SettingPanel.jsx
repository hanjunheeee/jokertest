// 설정 창 (탭 줄 + 내용 칸, 처음 탭은 일반)
// pages/SettingPage.jsx가 씀
import { motion } from "framer-motion"
import { useState } from "react"
import { useSettingsStorageStatus } from "../store/settings/storageStatus.js"
import SettingContentArea from "./SettingContentArea.jsx"
import SettingTabs from "./SettingTabs.jsx"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

const STORAGE_WARNING_CLASS =
  "mb-2 rounded bg-black/55 px-3 py-1.5 text-center app-text-scaled [--app-text-size:14px] text-amber-200"

const PANEL_CLASS =
  "absolute left-1/2 top-[clamp(6rem,15vh,8rem)] z-20 w-[min(56rem,88vw)] -translate-x-1/2"

// 인트로 끝나면 떠오르고, 그 전엔 누르지 못하게 막음
export default function SettingPanel({ visible }) {
  const [activeTab, setActiveTab] = useState("general")
  const storageWriteFailed = useSettingsStorageStatus((state) => state.writeFailed)

  return (
    <motion.div
      className={PANEL_CLASS}
      initial={{ opacity: 0, y: 10 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      {/* 기기에 저장 못 하면 바꾼 값이 새로고침 때 사라지는 걸 알림 */}
      {storageWriteFailed ? (
        <p role="status" className={STORAGE_WARNING_CLASS} data-settings-storage-warning="">
          설정을 이 기기에 저장하지 못했습니다. 새로고침하면 바꾼 값이 사라질 수 있습니다.
        </p>
      ) : null}
      <SettingTabs activeTab={activeTab} onSelect={setActiveTab} />
      <SettingContentArea activeTab={activeTab} visible={visible} />
    </motion.div>
  )
}
