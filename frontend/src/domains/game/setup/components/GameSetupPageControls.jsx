// 게임 설정 화면 구석 조작: 오른쪽 아래 소리 조절, 왼쪽 아래 뒤로 가기
// GameSetupPage가 씀
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

// 소리 조절·뒤로 가기 (뒤로 효과음은 useGameSetupPage가 직접 내서 data-sfx-owner로 막음)
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
