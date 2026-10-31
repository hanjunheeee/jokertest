import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

export default function SettingBackButton({ visible, onBack }) {
  return (
    <MotionBackButton
      initial={{ opacity: 0, y: 8 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
      transition={UI_REVEAL_TRANSITION}
      onClick={onBack}
      className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-30`}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    />
  )
}
