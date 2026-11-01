// 책 안쪽 내용 칸 (지금 탭 펼침면 + 쪽 넘김 줄)
// book/LibraryBookShell.jsx가 씀
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

// 목차·책갈피 다음에 떠오름, 탭 따라 펼침면 바꿈
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
        {/* 금지된 기록은 쪽 단위, 초대받은 자들은 직업 탭 단위 */}
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
      {/* 쪽 넘김은 금지된 기록만 (초대받은 자들은 직업 탭으로 넘김) */}
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