// 대기방 구석 조작: 오른쪽 아래 소리 조절(+친구 초대 버튼), 왼쪽 아래 뒤로 가기
// GameMatchingPage가 씀, 친구 초대 버튼은 rightControls로 받음
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

// 소리 조절 묶음·뒤로 가기 버튼
export default function MatchingPageControls({ visible, onBack, rightControls = null }) {
  return (
    <>
      {/* 오른쪽 아래 세로 줄: 받은 버튼 밑에 소리 조절 */}
      <div className="absolute bottom-4 right-4 z-30 flex flex-col items-end gap-[clamp(0.75rem,1.6vh,1.25rem)] sm:bottom-6 sm:right-6">
        {rightControls}
        <SoundControl />
      </div>

      <MotionBackButton
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
