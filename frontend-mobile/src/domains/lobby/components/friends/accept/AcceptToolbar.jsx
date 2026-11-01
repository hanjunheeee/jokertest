// 요청 수락 탭 버튼 줄 (전부 수락 + 새로고침)
// AcceptTab이 검색 줄 아래에 그림
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { TOOLBAR_CLASS } from "../sheetStyle.js"
import RefreshButton from "../parts/RefreshButton.jsx"

// 전부 수락 처리 중엔 다시 시작하지 않음
export default function AcceptToolbar({ running, onAcceptAll, onRefresh }) {
  return (
    <div className={TOOLBAR_CLASS}>
      <button
        type="button"
        onClick={() => { if (!running) onAcceptAll() }}
        aria-label={running ? "전부 수락 처리 중" : "전부 수락"}
        aria-disabled={running}
        disabled={running}
        className="relative h-11 w-32 shrink-0 border-0 bg-transparent p-0 active:scale-95 disabled:opacity-60"
      >
        <PublicAsset src={FRIEND_LIST_ASSETS.acceptAllButton} alt="" className="absolute inset-0 h-full w-full select-none object-fill" />
        <span className="relative font-subheading app-text-scaled [--app-text-size:14px] font-bold tracking-wide text-[#e8f0dc] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
          {running ? "처리 중…" : "전부 수락"}
        </span>
      </button>
      <RefreshButton label="친구 신청 목록 새로고침" onClick={onRefresh} />
    </div>
  )
}
