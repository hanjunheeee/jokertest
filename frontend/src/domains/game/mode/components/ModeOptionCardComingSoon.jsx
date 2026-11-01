import {
  COMING_SOON_OVERLAY_CLASS,
  COMING_SOON_TEXT_CLASS,
} from "@/domains/game/mode/constants/modeCardLayout.js"

export default function ModeOptionCardComingSoon() {
  return (
    <span className={COMING_SOON_OVERLAY_CLASS} aria-hidden="true">
      <span className={COMING_SOON_TEXT_CLASS}>준비중...</span>
    </span>
  )
}
