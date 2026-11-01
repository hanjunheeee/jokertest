// 사용자 화면 위층 (뒤로 버튼 + 소리 조절)
// 마이페이지·계정·이모티콘 팔레트 화면이 씀
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import PageSoundControlArea from "@/shared/ui/PageBackgroundMusic.jsx"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import {
  BACK_BTN_CLASS,
  LAYER_CLASS,
  SOUND_CONTROL_AREA_CLASS,
} from "@/domains/user/constants/userPageChromeLayout.js"

// 뒤로 갈 곳은 화면이 정해 넘김
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
