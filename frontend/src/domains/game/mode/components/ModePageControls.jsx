import BackButton from "@/shared/ui/BackButton.jsx"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"

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
