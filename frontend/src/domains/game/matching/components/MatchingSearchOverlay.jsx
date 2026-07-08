import {
  MATCHING_SEARCH_OVERLAY_CANCEL_CLASS,
  MATCHING_SEARCH_OVERLAY_CLASS,
  MATCHING_SEARCH_OVERLAY_DEFAULT_MESSAGE,
  MATCHING_SEARCH_OVERLAY_MESSAGE_CLASS,
} from "../constants/matchingSearchOverlayStyles.js"

/**
 * 매칭 큐 탐색 중 회색 오버레이 — isSearching 동안 표시
 *
 * @param {boolean} open
 * @param {() => void} onCancel
 * @param {string} [message]
 */
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
        취소
      </button>
    </div>
  )
}
