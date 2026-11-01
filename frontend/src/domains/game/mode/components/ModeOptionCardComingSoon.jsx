// 준비중 모드 카드 가림막 ("준비중...")
// ModeOptionCard가 씀
import {
  COMING_SOON_OVERLAY_CLASS,
  COMING_SOON_TEXT_CLASS,
} from "@/domains/game/mode/constants/modeCardLayout.js"

// 준비중 가림막 (읽기 프로그램엔 카드 aria-label로 알려서 숨김)
export default function ModeOptionCardComingSoon() {
  return (
    <span className={COMING_SOON_OVERLAY_CLASS} aria-hidden="true">
      <span className={COMING_SOON_TEXT_CLASS}>준비중...</span>
    </span>
  )
}
