// 요청 수락 탭 버튼 줄 (전부 수락 + 새로고침)
// AcceptTab에서 검색 줄 위에 그림
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { ACCEPT_BTN_IMG_CLASS } from "@/domains/lobby/constants/friendListStyle.js"
import RefreshButton from "../parts/RefreshButton.jsx"

const TOOLBAR_CLASS = "relative mb-0.5 flex w-full shrink-0 items-center justify-end gap-0.5 pr-0"

const LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:11px] font-bold tracking-wide text-[#e8f0dc] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"

// 전부 수락 처리 중엔 다시 시작하지 않음
export default function AcceptToolbar({ running, onAcceptAll, onRefresh }) {
  return (
    <div className={TOOLBAR_CLASS}>
      <button
        type="button"
        onClick={() => { if (!running) onAcceptAll?.() }}
        aria-label={running ? "전부 수락 처리 중" : "전부 수락"}
        aria-disabled={running}
        disabled={running}
        className="flex min-h-9 shrink-0 cursor-pointer items-center border-0 bg-transparent p-0 transition-opacity active:opacity-90"
      >
        <span className="relative block w-[5.15rem]">
          <PublicAsset src={FRIEND_LIST_ASSETS.acceptAllButton} alt="" className={ACCEPT_BTN_IMG_CLASS} />
          <span className={LABEL_CLASS}>{running ? "처리 중…" : "전부 수락"}</span>
        </span>
      </button>
      <RefreshButton compact label="친구 신청 목록 새로고침" onClick={onRefresh} />
    </div>
  )
}
