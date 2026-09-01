import { motion } from "framer-motion"
import { LIBRARY_TABS } from "@/domains/library/constants/libraryTabs.js"
import ForbiddenRecordsSpread from "@/domains/library/components/forbiddenRecords/ForbiddenRecordsSpread.jsx"
import InvitedGuestsSpread from "@/domains/library/components/invitedGuests/InvitedGuestsSpread.jsx"
import LibraryPageNavigation from "@/domains/library/components/book/LibraryPageNavigation.jsx"
import {
  LIBRARY_INNER_REVEAL_ANIMATE,
  LIBRARY_INNER_REVEAL_DELAYS,
  LIBRARY_INNER_REVEAL_INITIAL,
  LIBRARY_INNER_REVEAL_TRANSITION,
} from "@/domains/library/constants/libraryEntranceMotion.js"
import {
  LIBRARY_BOOK_CONTENT_CLASS,
  LIBRARY_BOOK_SPREAD_CLASS,
} from "@/domains/library/constants/libraryLayoutStyle.js"

/** 현재 목차에 맞는 책 본문 */
export default function LibraryBookContent({
  activeTabId,
  pageIndex = 0,
  canGoPrev = false,
  canGoNext = false,
  onPrevPage,
  onNextPage,
}) {
  return (
    <motion.div
      className={LIBRARY_BOOK_CONTENT_CLASS}
      initial={LIBRARY_INNER_REVEAL_INITIAL}
      animate={LIBRARY_INNER_REVEAL_ANIMATE}
      transition={{
        ...LIBRARY_INNER_REVEAL_TRANSITION,
        delay: LIBRARY_INNER_REVEAL_DELAYS.content,
      }}
    >
      <div className={LIBRARY_BOOK_SPREAD_CLASS}>
        {activeTabId === LIBRARY_TABS.forbiddenRecords.id ? (
          <ForbiddenRecordsSpread pageIndex={pageIndex} />
        ) : (
          <InvitedGuestsSpread />
        )}
      </div>
      {activeTabId === LIBRARY_TABS.forbiddenRecords.id && (
        <LibraryPageNavigation
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          onPrevPage={onPrevPage}
          onNextPage={onNextPage}
        />
      )}
    </motion.div>
  )
}
