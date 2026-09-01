import { motion } from "framer-motion"
import { LIBRARY_ASSETS } from "@/domains/library/constants/libraryAssets.js"
import LibraryBookContent from "@/domains/library/components/book/LibraryBookContent.jsx"
import LibraryBookmarkTabs from "@/domains/library/components/book/LibraryBookmarkTabs.jsx"
import LibraryTableOfContents from "@/domains/library/components/book/LibraryTableOfContents.jsx"
import {
  LIBRARY_BOOK_DROP_ANIMATE,
  LIBRARY_BOOK_DROP_INITIAL,
  LIBRARY_BOOK_DROP_TRANSITION,
} from "@/domains/library/constants/libraryEntranceMotion.js"
import {
  LIBRARY_BOOK_FRAME_CLASS,
  LIBRARY_BOOK_SHELL_CLASS,
  LIBRARY_BOOK_SHELL_OFFSET_CLASS,
  LIBRARY_BOOK_STAGE_CLASS,
} from "@/domains/library/constants/libraryLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

/** 기억의 서고 — 책 프레임 + 목차 + 책갈피 + 본문 */
export default function LibraryBookShell({
  activeTabId,
  onTabChange,
  pageIndex = 0,
  canGoPrev = false,
  canGoNext = false,
  onPrevPage,
  onNextPage,
}) {
  return (
    <div className={LIBRARY_BOOK_STAGE_CLASS}>
      <motion.div
        className={LIBRARY_BOOK_SHELL_CLASS}
        initial={LIBRARY_BOOK_DROP_INITIAL}
        animate={LIBRARY_BOOK_DROP_ANIMATE}
        transition={LIBRARY_BOOK_DROP_TRANSITION}
      >
        <div className={`relative ${LIBRARY_BOOK_SHELL_OFFSET_CLASS}`}>
          <PublicAsset
            src={LIBRARY_ASSETS.bookFrame}
            alt=""
            className={LIBRARY_BOOK_FRAME_CLASS}
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
          />
        </div>
      </motion.div>
    </div>
  )
}
