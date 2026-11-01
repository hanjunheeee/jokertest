// 친구 시트 탭 줄 (친구 추가·요청 수락·게임 초대·차단 목록, 켜짐/꺼짐 그림 + 글자)
// FriendsSheet가 맨 위에 그림
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { SHEET_TABS } from "./sheetStyle.js"

// 글자 모양은 데스크톱 VIEW_TAB_LABEL_CLASS와 같고 크기만 폰 폭에 맞춤
const LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap font-subheading app-text-scaled [--app-text-size:12px] font-bold tracking-wide [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 데스크톱 FriendListViewTabs처럼 대기 중인 게임 초대가 있으면 탭 글자에 개수를 붙임, 누르는 칸은 44px
export default function SheetTabs({ active, onSelect, inviteCount = 0 }) {
  return (
    <div role="tablist" aria-label="친구 목록 탭" className="grid min-w-0 flex-1 grid-cols-4 gap-1">
      {SHEET_TABS.map((tab) => {
        const selected = tab.id === active
        const label = tab.id === "invite" && inviteCount > 0 ? `${tab.label} ${inviteCount}` : tab.label
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={label}
            onClick={() => onSelect(tab.id)}
            className="interactive-scale relative h-11 min-w-0 overflow-hidden leading-none"
          >
            <PublicAsset
              src={selected ? FRIEND_LIST_ASSETS.tabButtonActive : FRIEND_LIST_ASSETS.tabButtonInactive}
              alt=""
              className="absolute inset-x-0 top-1/2 h-8 w-full -translate-y-1/2 select-none object-fill"
            />
            <span aria-hidden="true" className={`${LABEL_CLASS} ${selected ? "text-[#e8f0dc]" : "text-[#ebe2cc]/90"}`}>
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
