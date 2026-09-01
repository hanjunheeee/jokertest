import { motion } from "framer-motion"
import { getLibraryTab } from "@/domains/library/constants/libraryTabs.js"
import {
  LIBRARY_INNER_REVEAL_ANIMATE,
  LIBRARY_INNER_REVEAL_DELAYS,
  LIBRARY_INNER_REVEAL_INITIAL,
  LIBRARY_INNER_REVEAL_TRANSITION,
} from "@/domains/library/constants/libraryEntranceMotion.js"
import {
  LIBRARY_BOOK_TOC_CLASS,
  LIBRARY_BOOK_TOC_IMAGE_CLASS,
} from "@/domains/library/constants/libraryLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

/** 책 프레임 상단 중앙 — 현재 목차 표시 */
export default function LibraryTableOfContents({ activeTabId }) {
  const activeTab = getLibraryTab(activeTabId)

  return (
    <motion.div
      className={LIBRARY_BOOK_TOC_CLASS}
      initial={LIBRARY_INNER_REVEAL_INITIAL}
      animate={LIBRARY_INNER_REVEAL_ANIMATE}
      transition={{
        ...LIBRARY_INNER_REVEAL_TRANSITION,
        delay: LIBRARY_INNER_REVEAL_DELAYS.toc,
      }}
    >
      <PublicAsset
        src={activeTab.tocSrc}
        alt={activeTab.label}
        className={LIBRARY_BOOK_TOC_IMAGE_CLASS}
      />
    </motion.div>
  )
}
