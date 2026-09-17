// 파일 역할: MatchingPageControls.jsx - 화면을 구성하는 컴포넌트입니다.
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

/**
 * 매칭 대기 화면의 공통 조작 버튼입니다.
 *
 * F-19(AC-01): 우하단은 **하나의 세로 열**입니다. 예전에는 이 파일의 사운드 조절과
 * GameMatchingPage의 친구 목록 버튼이 각각 `absolute bottom-4 right-4`로 같은 자리를
 * 차지했고, 사운드 쪽이 z-30 + 화면 전체를 덮는 투명 range input이라 그 아래 z-10의 친구
 * 버튼이 마우스로는 눌리지 않았습니다(키보드 Enter로만 열렸습니다).
 *
 * 겹침을 없애는 대신 사운드를 가리지도 않도록, 로비(LobbyFriendArea)와 같은 방식으로 두
 * 조작을 같은 열에 위아래로 배치합니다. rightControls가 사운드 **위**에 놓입니다.
 */
export default function MatchingPageControls({ visible, onBack, rightControls = null }) {
  return (
    <>
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
