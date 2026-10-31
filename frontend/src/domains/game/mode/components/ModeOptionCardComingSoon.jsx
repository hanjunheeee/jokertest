import {
  MODE_CARD_COMING_SOON_OVERLAY_CLASS,
  MODE_CARD_COMING_SOON_TEXT_CLASS,
} from "@/domains/game/mode/constants/modeCardLayout.js"

export default function ModeOptionCardComingSoon() {
  return (
    <span className={MODE_CARD_COMING_SOON_OVERLAY_CLASS} aria-hidden="true">
      <span className={MODE_CARD_COMING_SOON_TEXT_CLASS}>준비중...</span>
    </span>
  )
}
