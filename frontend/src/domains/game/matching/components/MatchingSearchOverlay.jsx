// 빠른 매칭 찾는 중 덮개: 문구 + 취소 버튼
// GameModePage가 씀, 찾는 중일 때만 뜸
import {
  CANCEL_CLASS,
  CANCEL_TEXT_CLASS,
  OVERLAY_CLASS,
  DEFAULT_MSG,
  MSG_CLASS,
} from "@/domains/game/matching/constants/matchingSearchOverlayStyles"

// 매칭 찾는 중 덮개
export default function MatchingSearchOverlay({
  open,
  onCancel,
  message = DEFAULT_MSG,
}) {
  // 안 찾는 중이면 안 그림
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
