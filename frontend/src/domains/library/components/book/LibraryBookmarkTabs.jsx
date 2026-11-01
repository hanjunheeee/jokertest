// 책 오른쪽 책갈피 두 개 (금지된 기록·초대받은 자들 탭 바꾸기)
// book/LibraryBookShell.jsx가 씀
import { motion } from "framer-motion"
import { getLibraryTab } from "../../../../domains/library/constants/libraryTabs.js"
import {
  INNER_REVEAL_ANIMATE,
  INNER_REVEAL_DELAYS,
  INNER_REVEAL_INIT,
  INNER_REVEAL_TRANSITION,
} from "../../../../domains/library/constants/libraryEntranceMotion.js"
import {
  BOOKMARK_IMG_CLASS,
  BOOKMARK_ITEM_CLASS,
  BOOKMARK_STACK_CLASS,
} from "../../../../domains/library/constants/libraryLayoutStyle.js"
import PublicAsset from "../../../../shared/ui/PublicAsset"

// 지금 탭 책갈피에 aria-current 표시, 누르면 그 탭으로
export default function LibraryBookmarkTabs({ activeTabId, onTabChange }) {
  const forbiddenTab = getLibraryTab("forbiddenRecords")
  const invitedTab = getLibraryTab("invitedGuests")

  return (
    <motion.div
      className={BOOKMARK_STACK_CLASS}
      initial={INNER_REVEAL_INIT}
      animate={INNER_REVEAL_ANIMATE}
      transition={{
        ...INNER_REVEAL_TRANSITION,
        delay: INNER_REVEAL_DELAYS.bookmarks,
      }}
    >
      <button
        type="button"
        aria-label={forbiddenTab.label}
        aria-current={activeTabId === forbiddenTab.id ? "page" : undefined}
        onClick={() => onTabChange(forbiddenTab.id)}
        className={BOOKMARK_ITEM_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={forbiddenTab.bookmarkSrc}
          alt=""
          className={BOOKMARK_IMG_CLASS}
        />
      </button>
      <button
        type="button"
        aria-label={invitedTab.label}
        aria-current={activeTabId === invitedTab.id ? "page" : undefined}
        onClick={() => onTabChange(invitedTab.id)}
        className={BOOKMARK_ITEM_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={invitedTab.bookmarkSrc}
          alt=""
          className={BOOKMARK_IMG_CLASS}
        />
      </button>
    </motion.div>
  )
}