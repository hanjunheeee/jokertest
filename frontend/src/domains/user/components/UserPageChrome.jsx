import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import PageSoundControlArea from "@/shared/ui/PageBackgroundMusic.jsx"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import {
  BACK_BTN_CLASS,
  LAYER_CLASS,
  SOUND_CONTROL_AREA_CLASS,
} from "@/domains/user/constants/userPageChromeLayout.js"

export default function UserPageChrome({ onBack }) {
  return (
    <div className={LAYER_CLASS}>
      <MotionBackButton
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={BG_FADE_TRANSITION}
        onClick={onBack}
        className={BACK_BTN_CLASS}
      />
      <PageSoundControlArea className={SOUND_CONTROL_AREA_CLASS} />
    </div>
  )
}
