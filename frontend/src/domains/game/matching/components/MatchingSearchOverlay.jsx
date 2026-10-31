import {
  MATCHING_SEARCH_OVERLAY_CANCEL_CLASS,
  MATCHING_SEARCH_OVERLAY_CANCEL_TEXT_CLASS,
  MATCHING_SEARCH_OVERLAY_CLASS,
  MATCHING_SEARCH_OVERLAY_DEFAULT_MESSAGE,
  MATCHING_SEARCH_OVERLAY_MESSAGE_CLASS,
} from "@/domains/game/matching/constants/matchingSearchOverlayStyles"

export default function MatchingSearchOverlay({
  open,
  onCancel,
  message = MATCHING_SEARCH_OVERLAY_DEFAULT_MESSAGE,
}) {
  if (!open) return null

  return (
    <div className={MATCHING_SEARCH_OVERLAY_CLASS} role="dialog" aria-modal="true">
      <p className={MATCHING_SEARCH_OVERLAY_MESSAGE_CLASS}>{message}</p>
      <button type="button" onClick={onCancel} className={MATCHING_SEARCH_OVERLAY_CANCEL_CLASS}>
        <span className={MATCHING_SEARCH_OVERLAY_CANCEL_TEXT_CLASS}>취소</span>
      </button>
    </div>
  )
}
