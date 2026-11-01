import {
  CANCEL_CLASS,
  CANCEL_TEXT_CLASS,
  OVERLAY_CLASS,
  DEFAULT_MSG,
  MSG_CLASS,
} from "@/domains/game/matching/constants/matchingSearchOverlayStyles"

export default function MatchingSearchOverlay({
  open,
  onCancel,
  message = DEFAULT_MSG,
}) {
  if (!open) return null

  return (
    <div className={OVERLAY_CLASS} role="dialog" aria-modal="true">
      <p className={MSG_CLASS}>{message}</p>
      <button type="button" onClick={onCancel} className={CANCEL_CLASS}>
        <span className={CANCEL_TEXT_CLASS}>취소</span>
      </button>
    </div>
  )
}
