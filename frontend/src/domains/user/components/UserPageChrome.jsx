import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import PageSoundControlArea from "@/shared/ui/PageBackgroundMusic.jsx"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import {
  USER_PAGE_BACK_BUTTON_CLASS,
  USER_PAGE_CHROME_LAYER_CLASS,
  USER_PAGE_SOUND_CONTROL_AREA_CLASS,
} from "@/domains/user/constants/userPageChromeLayout.js"

/** 마이페이지 계열 화면의 뒤로가기 + 우하단 사운드 조절바 */
export default function UserPageChrome({ onBack }) {
  return (
    <div className={USER_PAGE_CHROME_LAYER_CLASS}>
      <MotionBackButton
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={BG_FADE_TRANSITION}
        onClick={onBack}
        className={USER_PAGE_BACK_BUTTON_CLASS}
      />
      <PageSoundControlArea className={USER_PAGE_SOUND_CONTROL_AREA_CLASS} />
    </div>
  )
}
