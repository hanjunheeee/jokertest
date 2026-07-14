// 파일 역할: MatchingSearchOverlay.jsx - 화면을 구성하는 컴포넌트입니다.
import {
  MATCHING_SEARCH_OVERLAY_CANCEL_CLASS,
  MATCHING_SEARCH_OVERLAY_CLASS,
  MATCHING_SEARCH_OVERLAY_DEFAULT_MESSAGE,
  MATCHING_SEARCH_OVERLAY_MESSAGE_CLASS,
} from "@/domains/game/matching/constants/matchingSearchOverlayStyles"

/** 빠른 매칭 검색 중에 화면을 덮는 대기 오버레이입니다. */
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
