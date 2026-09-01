import { useNavigate } from "react-router-dom"
import LibraryBackground from "@/domains/library/components/LibraryBackground.jsx"
import LibraryBookShell from "@/domains/library/components/book/LibraryBookShell.jsx"
import { LIBRARY_BACK_BUTTON_REVEAL_DELAY } from "@/domains/library/constants/libraryEntranceMotion.js"
import { LIBRARY_PAGE_ROOT_CLASS } from "@/domains/library/constants/libraryLayoutStyle.js"
import { useLibraryPage } from "@/domains/library/hooks/useLibraryPage.js"
import { useLibraryTab } from "@/domains/library/hooks/useLibraryTab.js"
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

/** 기억의 서고 — 금지된 기록 레이아웃 */
export default function LibraryPage() {
  const navigate = useNavigate()
  const { activeTabId, setActiveTabId } = useLibraryTab()
  const { pageIndex, goNext, goPrev, canGoNext, canGoPrev } = useLibraryPage(activeTabId)

  return (
    <div className={LIBRARY_PAGE_ROOT_CLASS}>
      <LibraryBackground />
      <LibraryBookShell
        activeTabId={activeTabId}
        onTabChange={setActiveTabId}
        pageIndex={pageIndex}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        onPrevPage={goPrev}
        onNextPage={goNext}
      />
      <MotionBackButton
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...UI_REVEAL_TRANSITION, delay: LIBRARY_BACK_BUTTON_REVEAL_DELAY }}
        onClick={() => navigate("/lobby")}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-30`}
      />
    </div>
  )
}
