import {
  MODE_CARD_COMING_SOON_OVERLAY_CLASS,
  MODE_CARD_COMING_SOON_TEXT_CLASS,
} from "@/domains/game/mode/constants/modeCardLayout.js"

// 아직 사용할 수 없는 모드 카드 위에 준비중 안내를 표시합니다.
export default function ModeOptionCardComingSoon() {
  return (
    <span className={MODE_CARD_COMING_SOON_OVERLAY_CLASS} aria-hidden="true">
      <span className={MODE_CARD_COMING_SOON_TEXT_CLASS}>준비중...</span>
    </span>
  )
}
