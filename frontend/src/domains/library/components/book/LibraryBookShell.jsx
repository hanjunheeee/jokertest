// 서고 책 틀 (책 그림 위에 목차·책갈피·내용 칸 겹침, 떨어지듯 등장)
// pages/LibraryPage.jsx가 씀
import { motion } from "framer-motion"
import { LIBRARY_ASSETS } from "../../../../domains/library/constants/libraryAssets.js"
import LibraryBookContent from "../../../../domains/library/components/book/LibraryBookContent.jsx"
import LibraryBookmarkTabs from "../../../../domains/library/components/book/LibraryBookmarkTabs.jsx"
import LibraryTableOfContents from "../../../../domains/library/components/book/LibraryTableOfContents.jsx"
import {
  BOOK_DROP_ANIMATE,
  BOOK_DROP_INIT,
  BOOK_DROP_TRANSITION,
} from "../../../../domains/library/constants/libraryEntranceMotion.js"
import {
  BOOK_FRAME_CLASS,
  BOOK_SHELL_CLASS,
  BOOK_SHELL_OFFSET_CLASS,
  BOOK_STAGE_CLASS,
} from "../../../../domains/library/constants/libraryLayoutStyle.js"
import PublicAsset from "../../../../shared/ui/PublicAsset"

// 페이지가 든 탭·쪽·직업 값을 책 안쪽 칸들로 나눠 넘김
export default function LibraryBookShell({
  activeTabId,
  onTabChange,
  pageIndex = 0,
  canGoPrev = false,
  canGoNext = false,
  onPrevPage,
  onNextPage,
  jobIndex,
  onJobChange,
  targetAchievementId = null,
}) {
  return (
    <div className={BOOK_STAGE_CLASS}>
      <motion.div
        className={BOOK_SHELL_CLASS}
        initial={BOOK_DROP_INIT}
        animate={BOOK_DROP_ANIMATE}
        transition={BOOK_DROP_TRANSITION}
      >
        <div className={`relative ${BOOK_SHELL_OFFSET_CLASS}`}>
          <PublicAsset
            src={LIBRARY_ASSETS.bookFrame}
            alt=""
            className={BOOK_FRAME_CLASS}
          />
          <LibraryTableOfContents activeTabId={activeTabId} />
          <LibraryBookmarkTabs activeTabId={activeTabId} onTabChange={onTabChange} />
          <LibraryBookContent
            activeTabId={activeTabId}
            pageIndex={pageIndex}
            canGoPrev={canGoPrev}
            canGoNext={canGoNext}
            onPrevPage={onPrevPage}
            onNextPage={onNextPage}
            jobIndex={jobIndex}
            onJobChange={onJobChange}
            targetAchievementId={targetAchievementId}
          />
        </div>
      </motion.div>
    </div>
  )
}