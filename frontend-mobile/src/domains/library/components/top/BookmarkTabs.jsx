// 금지된 기록·초대받은 자들 탭 (데스크톱 책갈피 그림 두 개를 가로로)
// top/LibraryTopBar.jsx가 씀
import { LIBRARY_TAB_LIST } from "@/domains/library/constants/libraryTabs.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { TAP_CLASS } from "@m/domains/library/constants/libraryStyle.js"

// 지금 탭은 aria-current + 밝게, 나머지는 흐리게
export default function BookmarkTabs({ activeTabId, onTabChange }) {
  return (
    <div className="flex shrink-0 items-center gap-2" role="tablist" aria-label="서고 탭">
      {LIBRARY_TAB_LIST.map((tab) => {
        const active = tab.id === activeTabId
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={tab.label}
            aria-current={active ? "page" : undefined}
            onClick={() => onTabChange(tab.id)}
            className={`${TAP_CLASS} w-[5.75rem] ${active ? "opacity-100 drop-shadow-[0_0_8px_rgba(255,200,140,0.45)]" : "opacity-60"}`}
          >
            <PublicAsset src={tab.bookmarkSrc} alt="" className="block h-auto w-full select-none" />
          </button>
        )
      })}
    </div>
  )
}
