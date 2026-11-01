// 서고 위 줄 (뒤로·지금 탭 목차 그림·소리 조절 + 탭 책갈피)
// pages/LibraryPage.jsx가 씀, 폰 가로에선 한 줄로 합침
import { getLibraryTab } from "@/domains/library/constants/libraryTabs.js"
import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import BookmarkTabs from "@m/domains/library/components/top/BookmarkTabs.jsx"
import SoundMini from "@m/domains/library/components/top/SoundMini.jsx"
import { TAP_CLASS } from "@m/domains/library/constants/libraryStyle.js"

// 뒤로는 로비로 (데스크톱과 같음), 목차 그림이 화면 제목 노릇
export default function LibraryTopBar({ activeTabId, onTabChange, onBack }) {
  const activeTab = getLibraryTab(activeTabId)

  return (
    <header className="relative z-10 flex shrink-0 flex-col gap-1 px-3 pt-2 land:flex-row land:items-center land:gap-3 land:pt-1">
      <div className="flex items-center justify-between gap-2 land:contents">
        <button
          type="button"
          aria-label="뒤로 가기"
          data-sfx-kind="ui-cancel"
          onClick={onBack}
          className={`${TAP_CLASS} w-12 shrink-0`}
        >
          <PublicAsset src={NAVIGATION_ASSETS.backButton} alt="" className="block h-auto w-full select-none" />
        </button>
        <h1 className="m-0 flex min-w-0 flex-1 justify-center land:flex-none">
          <PublicAsset
            src={activeTab.tocSrc}
            alt={activeTab.label}
            className="block h-10 w-auto max-w-full select-none object-contain"
          />
        </h1>
        <div className="land:order-last land:ml-auto">
          <SoundMini />
        </div>
      </div>
      <div className="flex justify-center land:justify-start">
        <BookmarkTabs activeTabId={activeTabId} onTabChange={onTabChange} />
      </div>
    </header>
  )
}
