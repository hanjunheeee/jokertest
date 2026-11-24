// ROLE_REVEAL 동안 화면을 살짝 어둡게 하고 입장 안내 문구 (역할 창은 위에 그대로)
// InGamePage가 사용 (모바일은 같은 상수로 EntryPreparingOverlay를 따로 둠)
import {
  INGAME_ENTRY_PREPARING_BACKDROP_CLASS,
  INGAME_ENTRY_PREPARING_MESSAGE,
  INGAME_ENTRY_PREPARING_MESSAGE_CLASS,
} from "../../constants/ingameEntryPreparing.js"

export default function InGameEntryPreparingOverlay({ open = false }) {
  if (!open) return null

  return (
    <div
      className={INGAME_ENTRY_PREPARING_BACKDROP_CLASS}
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-ingame-entry-preparing=""
    >
      <p className={INGAME_ENTRY_PREPARING_MESSAGE_CLASS}>{INGAME_ENTRY_PREPARING_MESSAGE}</p>
    </div>
  )
}