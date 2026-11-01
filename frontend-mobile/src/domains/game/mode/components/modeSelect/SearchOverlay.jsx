// 빠른 매칭 찾는 중 덮개: 문구 + 취소 버튼 (화면 전체)
// GameModePage가 씀, 모양은 데스크톱 matchingSearchOverlayStyles 그대로 (취소 버튼이 이미 44px)
import {
  CANCEL_CLASS,
  CANCEL_TEXT_CLASS,
  DEFAULT_MSG,
  MSG_CLASS,
  OVERLAY_CLASS,
} from "@/domains/game/matching/constants/matchingSearchOverlayStyles.js"

// 찾는 중일 때만 그림
export default function SearchOverlay({ open, onCancel, message = DEFAULT_MSG }) {
  if (!open) return null

  return (
    <div className={`${OVERLAY_CLASS} px-6 text-center`} role="dialog" aria-modal="true">
      <p className={MSG_CLASS}>{message}</p>
      <button type="button" onClick={onCancel} className={CANCEL_CLASS}>
        <span className={CANCEL_TEXT_CLASS}>취소</span>
      </button>
    </div>
  )
}
