// 금지된 기록·초대받은 자들 책갈피 두 개 (데스크톱 책갈피 그림, 책 오른쪽 세로 대신 위 줄 가로)
// top/LibraryTopBar.jsx가 씀
import { getLibraryTab } from "@/domains/library/constants/libraryTabs.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { TAP_CLASS } from "@m/domains/library/constants/libraryStyle.js"

// 데스크톱 LibraryBookmarkTabs처럼 금지된 기록 → 초대받은 자들 차례, 두 그림 다 같은 밝기
const TAB_IDS = ["forbiddenRecords", "invitedGuests"]

// 지금 탭 책갈피에 aria-current 표시, 누르면 그 탭으로 (지금 탭은 위 목차 그림으로 보임)
export default function BookmarkTabs({ activeTabId, onTabChange }) {
  return (
    <div className="flex shrink-0 items-center gap-2" aria-label="서고 탭">
      {TAB_IDS.map((tabId) => {
        const tab = getLibraryTab(tabId)
        return (
          <button
            key={tab.id}
            type="button"
            aria-label={tab.label}
            aria-current={activeTabId === tab.id ? "page" : undefined}
            onClick={() => onTabChange(tab.id)}
            className={`${TAP_CLASS} w-[5.75rem] hover:opacity-90`}
            style={{ outline: "none" }}
          >
            <PublicAsset src={tab.bookmarkSrc} alt="" className="block h-auto w-full select-none" />
          </button>
        )
      })}
    </div>
  )
}
