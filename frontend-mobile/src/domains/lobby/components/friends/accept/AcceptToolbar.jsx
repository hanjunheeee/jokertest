// 요청 수락 탭 버튼 줄 (전부 수락 + 새로고침)
// AcceptTab이 검색 줄 아래에 그림
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import {
  ACCEPT_BTN_IMG_CLASS,
  ACCEPT_TOOLBAR_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import RefreshButton from "../parts/RefreshButton.jsx"

// 글자 모양은 데스크톱 ACCEPT_ALL_LABEL_CLASS와 같고 크기만 폰에서 읽히게 키움
const LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:13px] font-bold tracking-wide text-[#e8f0dc] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"

// 전부 수락 처리 중엔 다시 시작하지 않음, 그림은 데스크톱 폭(6.1rem) 그대로 두고 누르는 칸만 44px
export default function AcceptToolbar({ running, onAcceptAll, onRefresh }) {
  return (
    <div className={`${ACCEPT_TOOLBAR_CLASS} !mt-0 !pr-0`}>
      <button
        type="button"
        onClick={() => { if (!running) onAcceptAll?.() }}
        aria-label={running ? "전부 수락 처리 중" : "전부 수락"}
        aria-disabled={running}
        disabled={running}
        className="flex min-h-11 shrink-0 cursor-pointer items-center border-0 bg-transparent p-0 transition-opacity active:opacity-90"
      >
        <span className="relative block w-[6.1rem]">
          <PublicAsset src={FRIEND_LIST_ASSETS.acceptAllButton} alt="" className={ACCEPT_BTN_IMG_CLASS} />
          <span className={LABEL_CLASS}>{running ? "처리 중…" : "전부 수락"}</span>
        </span>
      </button>
      <RefreshButton label="친구 신청 목록 새로고침" onClick={onRefresh} />
    </div>
  )
}
