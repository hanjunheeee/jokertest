// 친구 시트 탭 줄 (친구·추가·요청·초대·차단, 켜짐/꺼짐 그림 + 글자 + 개수)
// FriendsSheet가 머리 아래에 그림
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { SHEET_TABS } from "./sheetStyle.js"

// 데스크톱은 목록 탭 버튼이 없고 뒤로 버튼으로 돌아감 → 폰은 탭 다섯 개로 바로 오감
// 개수: 초대는 대기 중 초대(데스크톱과 같음), 요청은 받은 신청 수(폰에서 더함)
export default function SheetTabs({ active, onSelect, counts, panelId }) {
  return (
    <div role="tablist" aria-label="친구 목록 탭" className="grid min-w-0 flex-1 grid-cols-5 gap-1 pb-2">
      {SHEET_TABS.map((tab) => {
        const selected = tab.id === active
        const count = counts[tab.id] ?? 0
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${panelId}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={panelId}
            aria-label={count > 0 ? `${tab.ariaLabel} ${count}` : tab.ariaLabel}
            onClick={() => onSelect(tab.id)}
            className="relative h-11 min-w-0 border-0 bg-transparent p-0 active:scale-95"
          >
            <PublicAsset
              src={selected ? FRIEND_LIST_ASSETS.tabButtonActive : FRIEND_LIST_ASSETS.tabButtonInactive}
              alt=""
              className="absolute inset-0 h-full w-full select-none object-fill"
            />
            <span aria-hidden="true" className={`relative font-subheading app-text-scaled [--app-text-size:14px] font-bold [text-shadow:0_1px_2px_rgba(0,0,0,0.85)] ${selected ? "text-[#e8f0dc]" : "text-[#ebe2cc]/90"}`}>
              {tab.label}
            </span>
            {count > 0 ? (
              <span aria-hidden="true" className="absolute -right-0.5 -top-1 min-w-5 rounded-full bg-[#b50000] px-1 text-center text-[11px] font-bold leading-5 text-white">
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
