import { motion } from "framer-motion"
import { LIBRARY_TABS } from "../../../../domains/library/constants/libraryTabs.js"
import ForbiddenRecordsSpread from "../../../../domains/library/components/forbiddenRecords/ForbiddenRecordsSpread.jsx"
import InvitedGuestsSpread from "../../../../domains/library/components/invitedGuests/InvitedGuestsSpread.jsx"
import LibraryPageNavigation from "../../../../domains/library/components/book/LibraryPageNavigation.jsx"
import {
  INNER_REVEAL_ANIMATE,
  INNER_REVEAL_DELAYS,
  INNER_REVEAL_INIT,
  INNER_REVEAL_TRANSITION,
} from "../../../../domains/library/constants/libraryEntranceMotion.js"
import {
  BOOK_CONTENT_CLASS,
  BOOK_SPREAD_CLASS,
} from "../../../../domains/library/constants/libraryLayoutStyle.js"

export default function LibraryBookContent({
  activeTabId,
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
    <motion.div
      className={BOOK_CONTENT_CLASS}
      initial={INNER_REVEAL_INIT}
      animate={INNER_REVEAL_ANIMATE}
      transition={{
        ...INNER_REVEAL_TRANSITION,
        delay: INNER_REVEAL_DELAYS.content,
      }}
    >
      <div className={BOOK_SPREAD_CLASS}>
        {activeTabId === LIBRARY_TABS.forbiddenRecords.id ? (
          <ForbiddenRecordsSpread
            pageIndex={pageIndex}
            targetAchievementId={targetAchievementId}
          />
        ) : (
          <InvitedGuestsSpread
            jobIndex={jobIndex}
            onJobChange={onJobChange}
            targetAchievementId={targetAchievementId}
          />
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