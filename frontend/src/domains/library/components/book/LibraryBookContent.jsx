import { motion } from "framer-motion"
import { LIBRARY_TABS } from "../../../../domains/library/constants/libraryTabs.js"
import ForbiddenRecordsSpread from "../../../../domains/library/components/forbiddenRecords/ForbiddenRecordsSpread.jsx"
import InvitedGuestsSpread from "../../../../domains/library/components/invitedGuests/InvitedGuestsSpread.jsx"
import LibraryPageNavigation from "../../../../domains/library/components/book/LibraryPageNavigation.jsx"
import {
  LIBRARY_INNER_REVEAL_ANIMATE,
  LIBRARY_INNER_REVEAL_DELAYS,
  LIBRARY_INNER_REVEAL_INITIAL,
  LIBRARY_INNER_REVEAL_TRANSITION,
} from "../../../../domains/library/constants/libraryEntranceMotion.js"
import {
  LIBRARY_BOOK_CONTENT_CLASS,
  LIBRARY_BOOK_SPREAD_CLASS,
} from "../../../../domains/library/constants/libraryLayoutStyle.js"

/** 현재 목차에 맞는 책 본문 */
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
          <ForbiddenRecordsSpread
            pageIndex={pageIndex}
            targetAchievementId={targetAchievementId}
          />
        ) : (
          // F-17(AC-02): 직업 선택은 이제 LibraryPage가 소유한다 — URL 대상이 특정 직업을
          // 가리키는데 spread가 자체 상태로 0을 계속 들고 있으면 대상 직업이 열리지 않는다.
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