// 파일 역할: SettingBackButton.jsx - 화면을 구성하는 컴포넌트입니다.
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

/** 설정 화면에서 로비로 돌아가는 버튼입니다. */
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
