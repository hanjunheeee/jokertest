import { motion } from "framer-motion"
import { getLibraryTab } from "@/domains/library/constants/libraryTabs.js"
import {
  LIBRARY_INNER_REVEAL_ANIMATE,
  LIBRARY_INNER_REVEAL_DELAYS,
  LIBRARY_INNER_REVEAL_INITIAL,
  LIBRARY_INNER_REVEAL_TRANSITION,
} from "@/domains/library/constants/libraryEntranceMotion.js"
import {
  LIBRARY_BOOKMARK_IMAGE_CLASS,
  LIBRARY_BOOKMARK_ITEM_CLASS,
  LIBRARY_BOOKMARK_STACK_CLASS,
} from "@/domains/library/constants/libraryLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

/** 책 프레임 우측 책갈피 — 목차 전환 */
export default function LibraryBookmarkTabs({ activeTabId, onTabChange }) {
  const forbiddenTab = getLibraryTab("forbiddenRecords")
  const invitedTab = getLibraryTab("invitedGuests")

  return (
    <motion.div
      className={LIBRARY_BOOKMARK_STACK_CLASS}
      initial={LIBRARY_INNER_REVEAL_INITIAL}
      animate={LIBRARY_INNER_REVEAL_ANIMATE}
      transition={{
        ...LIBRARY_INNER_REVEAL_TRANSITION,
        delay: LIBRARY_INNER_REVEAL_DELAYS.bookmarks,
      }}
    >
      <button
        type="button"
        aria-label={forbiddenTab.label}
        aria-current={activeTabId === forbiddenTab.id ? "page" : undefined}
        onClick={() => onTabChange(forbiddenTab.id)}
        className={LIBRARY_BOOKMARK_ITEM_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={forbiddenTab.bookmarkSrc}
          alt=""
          className={LIBRARY_BOOKMARK_IMAGE_CLASS}
        />
      </button>
      <button
        type="button"
        aria-label={invitedTab.label}
        aria-current={activeTabId === invitedTab.id ? "page" : undefined}
        onClick={() => onTabChange(invitedTab.id)}
        className={LIBRARY_BOOKMARK_ITEM_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={invitedTab.bookmarkSrc}
          alt=""
          className={LIBRARY_BOOKMARK_IMAGE_CLASS}
        />
      </button>
    </motion.div>
  )
}
