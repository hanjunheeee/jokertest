// 파일 역할: ModePageControls.jsx - 화면을 구성하는 컴포넌트입니다.
import BackButton from "@/shared/ui/BackButton.jsx"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"

/** 게임 모드 계열 화면의 사운드 버튼과 뒤로가기 버튼을 묶습니다. */
export default function ModePageControls({
  onBack,
  backAriaLabel = "뒤로 가기",
  showSound = true,
}) {
  return (
    <>
      {showSound ? (
        <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6">
          <SoundControl />
        </div>
      ) : null}

      <BackButton
        ariaLabel={backAriaLabel}
        onClick={onBack}
        className={BACK_BUTTON_PAGE_POSITION_CLASS}
      />
    </>
  )
}
