import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

export default function GameSetupPageControls({ visible, onBack }) {
  return (
    <>
      <div className="absolute bottom-4 right-4 z-30 sm:bottom-6 sm:right-6">
        <SoundControl />
      </div>

      <MotionBackButton
        data-sfx-owner="explicit"
        ariaLabel="멀티플레이 선택으로 돌아가기"
        initial={{ opacity: 0, y: 8 }}
        animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={UI_REVEAL_TRANSITION}
        onClick={onBack}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-30`}
        style={{ pointerEvents: visible ? "auto" : "none" }}
      />
    </>
  )
}
